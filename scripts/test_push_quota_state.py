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
