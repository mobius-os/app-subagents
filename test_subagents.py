import argparse
import importlib.util
import os
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("subagents.py")
SPEC = importlib.util.spec_from_file_location("subagents_helper", MODULE_PATH)
subagents = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(subagents)


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

  def test_read_and_write_scopes_map_to_provider_native_guards(self):
    claude = subagents._command("claude", "read", None, None)
    codex = subagents._command("codex", "write", "gpt-5.6-sol", "high")

    self.assertIn("plan", claude)
    self.assertIn("workspace-write", codex)
    self.assertIn('model_reasoning_effort="high"', codex)


if __name__ == "__main__":
  unittest.main()
