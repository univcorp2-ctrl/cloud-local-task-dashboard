import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

import push_quota_state as pqs


class MusePayloadTest(unittest.TestCase):
    def test_converts_drive_payload_and_drops_stale(self):
        now = dt.datetime(2026, 10, 31, 0, 40, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "token_status_payload.json"
            p.write_text(json.dumps({"updated_at": "2026-10-31T00:30:50+09:00", "subscription": {"plan": "free"},
                "weekly_free_limit": {"remaining_percent": 67, "resets_at": "2026-11-06T11:54:00+09:00"},
                "additional_tokens": {"remaining_percent": 98, "remaining_tokens_reported": "7.8B"}}), encoding="utf-8")
            q = pqs.muse_quota(p, now)
            self.assertEqual(q["provider"], "muse")
            self.assertEqual(q["windows"][0]["remainingPercent"], 67)
            self.assertEqual(q["windows"][1]["remainingText"], "7.8B")
            self.assertEqual(q["quality"], "self_reported")
            p.write_text(json.dumps({"updated_at": "2026-10-01T00:00:00+09:00", "weekly_free_limit": {"remaining_percent": 5}}), encoding="utf-8")
            self.assertIsNone(pqs.muse_quota(p, now))
            self.assertIsNone(pqs.muse_quota(Path(d) / "missing.json", now))

    def test_local_quotas_skip_unavailable_sources(self):
        now = dt.datetime(2026, 10, 31, 0, 40, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as d:
            home = Path(d)
            (home / ".claude").mkdir()
            (home / ".claude/usage-dashboard-statusline.json").write_text(json.dumps({"observedAt": "2026-10-31T00:30:00Z",
                "rate_limits": {"five_hour": {"used_percentage": 12, "resets_at": 1793500000}, "seven_day": {"used_percentage": 59, "resets_at": 1793700000}}}), encoding="utf-8")
            quotas = pqs.local_quotas(home, home / "AppData/Roaming", now)
            self.assertEqual([q["provider"] for q in quotas], ["claude"])
            kinds = {w["kind"]: w for w in quotas[0]["windows"]}
            self.assertEqual(kinds["weekly"]["usedPercent"], 59)
            self.assertEqual(kinds["five_hour"]["usedPercent"], 12)


if __name__ == "__main__":
    unittest.main()


class LiveSourcesTest(unittest.TestCase):
    def test_claude_windows_from_usage_payload(self):
        now = dt.datetime(2026, 10, 31, 7, 10, tzinfo=dt.timezone.utc)
        q = pqs.claude_windows({"five_hour": {"utilization": 10.0, "resets_at": "2026-10-31T10:30:00Z"},
                                "seven_day": {"utilization": 80.0, "resets_at": "2026-11-01T12:00:00Z"},
                                "iguana_necktie": {"utilization": 28.2}, "seven_day_opus": None}, now)
        self.assertEqual(q["provider"], "claude")
        self.assertEqual([w["kind"] for w in q["windows"]], ["weekly", "five_hour"])
        self.assertEqual(q["windows"][0]["usedPercent"], 80.0)
        self.assertIsNone(pqs.claude_windows({"five_hour": None, "seven_day": None}, now))

    def test_antigravity_windows_prefer_recommended_then_tightest(self):
        now = dt.datetime(2026, 10, 31, 7, 10, tzinfo=dt.timezone.utc)
        body = {"userStatus": {"cascadeModelConfigData": {"clientModelConfigs": [
            {"label": "Claude Sonnet", "quotaInfo": {"remainingFraction": 0.2, "resetTime": "2026-11-01T00:00:00Z"}},
            {"label": "Gemini 4 Argon (Medium)", "isRecommended": True, "quotaInfo": {"remainingFraction": 0.6827, "resetTime": "2026-11-04T03:06:17Z"}},
            {"label": "Gemini 4 Argon (Medium)", "quotaInfo": {"remainingFraction": 0.9}},
            {"label": "No quota model"}]}}}
        q = pqs.antigravity_windows(body, now)
        self.assertEqual(q["windows"][0]["label"], "Gemini 4 Argon (Medium)")
        self.assertEqual(q["windows"][0]["remainingPercent"], 68.3)
        self.assertEqual(q["windows"][1]["label"], "Claude Sonnet")
        self.assertEqual(len(q["windows"]), 2)
        self.assertIsNone(pqs.antigravity_windows({}, now))


class UsageAttributionTest(unittest.TestCase):
    def test_codex_groups_exec_prompts_and_attributes_quota(self):
        import collect_token_usage as ctu
        now = dt.datetime(2026, 10, 31, 10, 0, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as d:
            home = Path(d); sess = home / ".codex/sessions/2026/10/31"; sess.mkdir(parents=True)
            def write(name, prompt, total, origin="codex_exec"):
                lines = [{"type": "session_meta", "payload": {"cwd": "C:\\\\AI-Agent\\\\workspace", "originator": origin, "source": "exec"}},
                         {"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": prompt}]}},
                         {"type": "event_msg", "timestamp": "2026-10-31T09:00:00Z", "payload": {"type": "token_count", "info": {"total_token_usage": {"total_tokens": total, "input_tokens": total, "cached_input_tokens": 0, "output_tokens": 0}}}}]
                (sess / name).write_text("\n".join(json.dumps(x) for x in lines), encoding="utf-8")
            write("a.jsonl", "# 物件スクレイパー修正\nmore", 600)
            write("b.jsonl", "# 物件スクレイパー修正\nmore", 200)
            write("c.jsonl", "hello", 200, origin="codex_cli_rs")
            u = ctu.codex_usage(home, now, 20.0)
            self.assertEqual(u["totalTokens"], 1000)
            top = u["items"][0]
            self.assertEqual(top["label"], "物件スクレイパー修正")
            self.assertEqual(top["runs"], 2)
            self.assertEqual(top["sharePercent"], 80.0)
            self.assertEqual(top["quotaPercent"], 16.0)
            self.assertEqual(u["items"][1]["kind"], "cli")

    def test_claude_surfaces_and_scheduled_estimate(self):
        import collect_token_usage as ctu
        now = dt.datetime(2026, 10, 31, 10, 0, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as d:
            tf = Path(d) / "t.json"
            tf.write_text(json.dumps({"tasks": [{"name": "Earn Lab A", "runsPerWeek": 168, "avgSeconds": 420}, {"name": "腸活", "runsPerWeek": 7, "avgSeconds": 30}]}), encoding="utf-8")
            body = {"seven_day": {"utilization": 87}, "seven_day_breakdown": {"rows": [{"key": "cowork", "display_name": "Cowork", "percent": 92}, {"key": "chat", "display_name": "Chats", "percent": 8}]}}
            u = ctu.claude_usage(body, Path(d), now, tf)
            surf = {i["key"]: i for i in u["items"]}
            self.assertEqual(surf["surface:cowork"]["quotaPercent"], 80.0)
            a = next(i for i in u["items"] if i["label"] == "Earn Lab A")
            self.assertGreater(a["sharePercent"], 91)
