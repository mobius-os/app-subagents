#!/usr/bin/env python3
"""Guarded Claude/Codex delegation for the Subagents app.

This is deliberately the one execution boundary shared by both providers:
configuration, passive connection checks, model resolution, recursion limits,
runtime-status recording, and honest exit propagation all live here.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

APP_DIR = Path(__file__).resolve().parent
CATALOG = json.loads((APP_DIR / "models.json").read_text(encoding="utf-8"))
PROVIDERS = ("claude", "codex")
MAX_DEPTH = 1


class SubagentError(RuntimeError):
  pass


def _api(path: str, method: str = "GET", body: object | None = None):
  base = os.environ.get("API_BASE_URL", "").rstrip("/")
  token = os.environ.get("AGENT_TOKEN", "")
  if not base or not token:
    raise SubagentError("Möbius API context is unavailable in this turn.")
  data = None if body is None else json.dumps(body).encode()
  req = Request(
    base + path,
    data=data,
    method=method,
    headers={
      "Authorization": f"Bearer {token}",
      "Content-Type": "application/json",
    },
  )
  try:
    with urlopen(req, timeout=15) as response:
      raw = response.read()
      return json.loads(raw) if raw else None
  except HTTPError as exc:
    if exc.code == 404:
      return None
    detail = exc.read().decode("utf-8", "replace")
    raise SubagentError(f"Möbius returned HTTP {exc.code}: {detail}") from exc
  except URLError as exc:
    raise SubagentError(f"Could not reach Möbius: {exc.reason}") from exc


def _apps() -> list[dict]:
  value = _api("/api/apps/")
  return value if isinstance(value, list) else []


def _app_id() -> int:
  for app in _apps():
    source = str(app.get("source_dir") or "")
    if (
      app.get("slug") in ("subagents", "codex")
      or app.get("name") == "Subagents"
      or Path(source).resolve() == APP_DIR
    ):
      return int(app["id"])
  raise SubagentError("The installed Subagents app could not be found.")


def _storage_get(app_id: int, name: str) -> dict:
  value = _api(f"/api/storage/apps/{app_id}/{name}")
  return value if isinstance(value, dict) else {}


def _storage_put(app_id: int, name: str, value: dict) -> None:
  _api(f"/api/storage/apps/{app_id}/{name}", method="PUT", body=value)


def _normalize_config(value: dict) -> dict:
  providers = value.get("providers")
  if isinstance(providers, dict):
    normalized = {"version": 1, "providers": {}}
    for provider in PROVIDERS:
      row = providers.get(provider)
      row = row if isinstance(row, dict) else {}
      normalized["providers"][provider] = {
        "enabled": row.get("enabled") is True,
        "default_model": row.get("default_model"),
        "default_effort": row.get("default_effort"),
      }
    return normalized

  # Preserve the old Codex app's effective behavior: it defaulted to enabled
  # even when the legacy file only carried a model. Claude remains opt-in.
  legacy_present = bool(value)
  return {
    "version": 1,
    "providers": {
      "claude": {
        "enabled": False,
        "default_model": None,
        "default_effort": None,
      },
      "codex": {
        "enabled": (
          value.get("enabled") is not False if legacy_present else False
        ),
        "default_model": (
          value.get("default")
          or CATALOG["providers"]["codex"]["default_model"]
        ),
        "default_effort": None,
      },
    },
  }


def _connections() -> dict:
  value = _api("/api/auth/providers/status")
  return value if isinstance(value, dict) else {}


def _models() -> dict:
  value = _api("/api/auth/providers/models")
  if isinstance(value, dict):
    return value
  return {
    provider: [
      {"id": row["id"], "name": row.get("name", row["id"])}
      for row in CATALOG["providers"][provider]["models"]
    ]
    for provider in PROVIDERS
  }


def snapshot() -> dict:
  app_id = _app_id()
  config = _normalize_config(_storage_get(app_id, "config.json"))
  runtime = _storage_get(app_id, "status.json").get("providers", {})
  connections = _connections()
  live_models = _models()
  out = {"app_id": app_id, "providers": {}}
  for provider in PROVIDERS:
    pref = config["providers"][provider]
    conn = connections.get(provider)
    conn = conn if isinstance(conn, dict) else {}
    fallback = CATALOG["providers"][provider]
    out["providers"][provider] = {
      "connected": conn.get("configured") is True,
      "connection_error": conn.get("error"),
      "enabled": pref["enabled"],
      "default_model": pref["default_model"] or fallback["default_model"],
      "default_effort": pref["default_effort"],
      "runtime": runtime.get(provider),
      "models": live_models.get(provider) or fallback["models"],
      "aliases": {
        row["id"]: row.get("aliases", [])
        for row in fallback["models"]
      },
    }
  return out


def _resolve_model(provider: str, requested: str | None, state: dict) -> str | None:
  wanted = (requested or state.get("default_model") or "").strip().lower()
  if not wanted:
    return None
  candidates = state.get("models") or []
  exact = [
    row["id"] for row in candidates
    if str(row.get("id", "")).lower() == wanted
  ]
  if exact:
    return exact[0]
  matches = []
  aliases = state.get("aliases") or {}
  for row in candidates:
    model_id = str(row.get("id", ""))
    values = [str(row.get("name", "")), *aliases.get(model_id, [])]
    if any(wanted == value.strip().lower() for value in values if value):
      matches.append(model_id)
  if len(matches) == 1:
    return matches[0]
  if len(matches) > 1:
    raise SubagentError(
      f"Model {requested!r} is ambiguous: {', '.join(matches)}."
    )
  raise SubagentError(
    f"Model {requested or state.get('default_model')!r} is not in the "
    f"current {provider} registry."
  )


def _record(app_id: int, provider: str, state: str, detail: str, model: str | None):
  status = _storage_get(app_id, "status.json")
  providers = status.get("providers")
  providers = providers if isinstance(providers, dict) else {}
  providers[provider] = {
    "state": state,
    "detail": detail[:1000],
    "model": model,
    "checked_at": datetime.now(UTC).isoformat(),
  }
  _storage_put(app_id, "status.json", {"version": 1, "providers": providers})


def _classify_failure(text: str) -> str:
  lowered = text.lower()
  if any(term in lowered for term in (
    "monthly spend limit", "usage limit", "quota", "credit balance",
    "rate limit", "too many requests",
  )):
    return "quota_limited"
  if any(term in lowered for term in (
    "not logged in", "authentication", "unauthorized", "reconnect",
    "invalid api key", "token has expired",
  )):
    return "auth_error"
  return "temporarily_unavailable"


def _command(provider: str, scope: str, model: str | None, effort: str | None):
  if provider == "claude":
    cmd = [
      "claude", "-p", "--output-format", "text",
      "--no-session-persistence",
      "--permission-mode", "plan" if scope == "read" else "acceptEdits",
      "--max-budget-usd", "5",
    ]
    if model:
      cmd += ["--model", model]
    if effort:
      cmd += ["--effort", effort]
    return cmd
  cmd = [
    "codex", "exec", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only" if scope == "read" else "workspace-write",
  ]
  if model:
    cmd += ["--model", model]
  if effort:
    cmd += ["-c", f'model_reasoning_effort="{effort}"']
  cmd.append("-")
  return cmd


def run(args: argparse.Namespace) -> int:
  depth = int(os.environ.get("MOBIUS_SUBAGENT_DEPTH", "0") or 0)
  if depth >= MAX_DEPTH:
    raise SubagentError(
      f"Delegation depth {depth} reached the maximum ({MAX_DEPTH})."
    )
  snap = snapshot()
  state = snap["providers"][args.provider]
  if not state["connected"]:
    detail = state.get("connection_error") or "connect it in Möbius Settings"
    raise SubagentError(f"{args.provider.title()} is not connected: {detail}")
  if not state["enabled"] and not args.explicit:
    raise SubagentError(
      f"{args.provider.title()} is paused in the Subagents app."
    )
  model = _resolve_model(args.provider, args.model, state)
  effort = args.effort or state.get("default_effort")
  prompt = Path(args.prompt_file).read_text(encoding="utf-8").strip()
  if not prompt:
    raise SubagentError("The delegated prompt is empty.")
  guarded_prompt = (
    "You are a delegated subagent inside Möbius. Do not invoke, consult, "
    "or delegate to any other agent, model, provider, or CLI. Complete only "
    "the bounded task below and return control to the parent. Preserve the "
    "stated read/write scope exactly.\n\n" + prompt
  )
  env = os.environ.copy()
  env["MOBIUS_SUBAGENT_DEPTH"] = str(depth + 1)
  env["MOBIUS_SUBAGENT_PROVIDER"] = args.provider
  cmd = _command(args.provider, args.scope, model, effort)
  try:
    proc = subprocess.run(
      cmd,
      input=guarded_prompt,
      text=True,
      capture_output=True,
      env=env,
      cwd=args.cwd or os.getcwd(),
      timeout=args.timeout,
    )
  except subprocess.TimeoutExpired as exc:
    detail = f"Timed out after {args.timeout} seconds."
    _record(snap["app_id"], args.provider, "temporarily_unavailable", detail, model)
    raise SubagentError(detail) from exc
  combined = "\n".join(part for part in (proc.stdout, proc.stderr) if part).strip()
  if proc.returncode == 0:
    _record(snap["app_id"], args.provider, "available", "Last call succeeded.", model)
  else:
    _record(
      snap["app_id"], args.provider, _classify_failure(combined),
      combined or f"Exited with status {proc.returncode}.", model,
    )
  if proc.stdout:
    sys.stdout.write(proc.stdout)
  if proc.stderr:
    sys.stderr.write(proc.stderr)
  return proc.returncode


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description=__doc__)
  sub = parser.add_subparsers(dest="command", required=True)
  sub.add_parser("snapshot", help="Print the effective live provider state.")
  run_parser = sub.add_parser("run", help="Run one guarded delegated turn.")
  run_parser.add_argument("--provider", choices=PROVIDERS, required=True)
  run_parser.add_argument("--scope", choices=("read", "write"), required=True)
  run_parser.add_argument("--model")
  run_parser.add_argument("--effort")
  run_parser.add_argument("--explicit", action="store_true")
  run_parser.add_argument("--prompt-file", required=True)
  run_parser.add_argument("--cwd")
  run_parser.add_argument("--timeout", type=int, default=1800)
  return parser


def main() -> int:
  args = build_parser().parse_args()
  try:
    if args.command == "snapshot":
      print(json.dumps(snapshot(), indent=2))
      return 0
    return run(args)
  except (OSError, ValueError, SubagentError) as exc:
    print(f"subagents: {exc}", file=sys.stderr)
    return 2


if __name__ == "__main__":
  raise SystemExit(main())
