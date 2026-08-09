import argparse
from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("subagents.py")
SPEC = importlib.util.spec_from_file_location("subagents_helper", MODULE_PATH)
subagents = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(subagents)


def run_args(prompt_path: str, *, name: str, background: bool = False):
  return argparse.Namespace(
    provider="codex", name=name, scope="read", model=None,
    effort=None, explicit=False, prompt_file=prompt_path, cwd="/data",
    background=background, timeout=10, poll_interval=0.001,
  )


def connected_snapshot():
  return {
    "app_id": 102,
    "providers": {
      "codex": {
        "connected": True, "enabled": True,
        "default_model": "gpt-5.6-sol", "default_effort": None,
        "models": [{"id": "gpt-5.6-sol", "name": "Sol"}],
        "aliases": {},
      }
    },
  }


class SubagentsContractTests(unittest.TestCase):
  def test_legacy_config_preserves_codex_and_keeps_claude_opt_in(self):
    config = subagents._normalize_config({"default": "gpt-5.6-sol"})

    self.assertFalse(config["providers"]["claude"]["enabled"])
    self.assertTrue(config["providers"]["codex"]["enabled"])
    self.assertEqual(
      config["providers"]["codex"]["default_model"], "gpt-5.6-sol"
    )

  def test_fresh_config_enables_neither_provider(self):
    config = subagents._normalize_config({})

    self.assertFalse(config["providers"]["claude"]["enabled"])
    self.assertFalse(config["providers"]["codex"]["enabled"])

  def test_model_alias_resolves_only_to_registry_entry(self):
    state = {
      "default_model": "gpt-5.6-sol",
      "models": [{"id": "gpt-5.6-sol", "name": "GPT-5.6 Sol"}],
      "aliases": {"gpt-5.6-sol": ["sol"]},
    }

    self.assertEqual(
      subagents._resolve_model("codex", "sol", state), "gpt-5.6-sol"
    )
    with self.assertRaisesRegex(subagents.SubagentError, "not in the current"):
      subagents._resolve_model("codex", "invented", state)

  def test_runtime_failure_classification_keeps_quota_distinct(self):
    self.assertEqual(
      subagents._classify_failure("You've hit your monthly spend limit"),
      "quota_limited",
    )
    self.assertEqual(
      subagents._classify_failure("Token has expired; reconnect"),
      "auth_error",
    )
    self.assertEqual(
      subagents._classify_failure("upstream returned 503"),
      "temporarily_unavailable",
    )

  def test_depth_limit_stops_before_snapshot_or_spend(self):
    args = argparse.Namespace(provider="codex")
    original = os.environ.get("MOBIUS_SUBAGENT_DEPTH")
    os.environ["MOBIUS_SUBAGENT_DEPTH"] = "1"
    try:
      with self.assertRaisesRegex(subagents.SubagentError, "maximum"):
        subagents.run(args)
    finally:
      if original is None:
        os.environ.pop("MOBIUS_SUBAGENT_DEPTH", None)
      else:
        os.environ["MOBIUS_SUBAGENT_DEPTH"] = original

  def test_run_submits_named_durable_work_and_returns_result(self):
    with tempfile.NamedTemporaryFile("w", delete=False) as handle:
      handle.write("Audit the restart path.")
      prompt_path = handle.name
    args = run_args(prompt_path, name="audit-restart")
    calls = []

    def fake_api(path, method="GET", body=None):
      calls.append((path, method, body))
      return {
        "id": "delegation-1", "status": "completed", "result": "Done.",
      }

    try:
      with patch.dict(os.environ, {"CHAT_ID": "parent-chat"}), \
           patch.object(subagents, "snapshot", return_value=connected_snapshot()), \
           patch.object(subagents, "_api", side_effect=fake_api), \
           patch.object(subagents, "_record"):
        self.assertEqual(subagents.run(args), 0)
    finally:
      Path(prompt_path).unlink(missing_ok=True)

    self.assertEqual(calls[0][0], "/api/delegations")
    self.assertEqual(calls[0][1], "POST")
    self.assertEqual(calls[0][2]["task_key"], "audit-restart")
    self.assertEqual(calls[0][2]["parent_chat_id"], "parent-chat")
    self.assertIs(calls[0][2]["notify_parent_on_complete"], False)

  def test_completed_truncated_result_names_the_durable_transcript(self):
    with tempfile.NamedTemporaryFile("w", delete=False) as handle:
      handle.write("Audit the large result path.")
      prompt_path = handle.name
    args = run_args(prompt_path, name="large-result")
    delegation = {
      "id": "delegation-large", "child_chat_id": "child-large",
      "status": "completed", "result": "Partial result.",
      "result_truncated": True,
    }
    stdout = io.StringIO()
    stderr = io.StringIO()
    try:
      with patch.dict(os.environ, {"CHAT_ID": "parent-chat"}), \
           patch.object(subagents, "snapshot", return_value=connected_snapshot()), \
           patch.object(subagents, "_api", return_value=delegation), \
           patch.object(subagents, "_record"), \
           redirect_stdout(stdout), redirect_stderr(stderr):
        self.assertEqual(subagents.run(args), 0)
    finally:
      Path(prompt_path).unlink(missing_ok=True)

    self.assertEqual(stdout.getvalue(), "Partial result.\n")
    self.assertIn("child-large", stderr.getvalue())
    self.assertIn("complete transcript", stderr.getvalue())

  def test_background_run_submits_with_wake_and_returns_without_polling(self):
    with tempfile.NamedTemporaryFile("w", delete=False) as handle:
      handle.write("Audit the restart path in the background.")
      prompt_path = handle.name
    args = run_args(prompt_path, name="bg-audit", background=True)
    calls = []

    def fake_api(path, method="GET", body=None):
      calls.append((path, method, body))
      # Only the submit should ever be called in background mode.
      return {"id": "delegation-bg", "child_chat_id": "child-bg",
              "status": "starting"}

    stdout = io.StringIO()
    try:
      with patch.dict(os.environ, {"CHAT_ID": "parent-chat"}), \
           patch.object(subagents, "snapshot", return_value=connected_snapshot()), \
           patch.object(subagents, "_api", side_effect=fake_api), \
           patch.object(subagents, "_record"), \
           redirect_stdout(stdout):
        self.assertEqual(subagents.run(args), 0)
    finally:
      Path(prompt_path).unlink(missing_ok=True)

    # Exactly one API call (the submit) — no polling loop in background mode.
    self.assertEqual(len(calls), 1)
    self.assertEqual(calls[0][0], "/api/delegations")
    self.assertIs(calls[0][2]["notify_parent_on_complete"], True)
    self.assertIn("delegation-bg", stdout.getvalue())
    self.assertIn("auto-woken", stdout.getvalue())

if __name__ == "__main__":
  unittest.main()
