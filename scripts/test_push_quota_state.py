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
