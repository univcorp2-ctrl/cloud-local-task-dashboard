import datetime as dt
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from collect_ai_quotas import merge_observations


class QuotaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.now = dt.datetime(2026, 10, 20, 3, tzinfo=dt.timezone.utc)
        self.catalog = {'quotas': [{'provider': name, 'usedPercent': 99,
                                   'weeklyUsedPercent': 99, 'quality': 'measured'}
                                  for name in ('Codex CLI', 'Claude Code CLI', 'Gemini / Antigravity CLI')]}
        self.db = self.home / 'state.vscdb'

    def collect(self):
        return merge_observations(self.catalog, self.home, appdata=self.home,
                                  now=self.now, ag_db=self.db)['quotas']

    def write_ag(self, records):
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute('CREATE TABLE ItemTable (key TEXT, value TEXT)')
            conn.execute('INSERT INTO ItemTable VALUES (?, ?)',
                         ('crsx.ag-usage', json.dumps({'quotaHistory': records})))

    def test_ag_latest_per_category_and_zero_remaining(self):
        self.write_ag([
            {'category': 'Gemini Pro', 'currentQuota': 0, 'timestamp': '2026-10-20T02:50:00Z'},
            {'category': 'Gemini Pro', 'currentQuota': .8, 'timestamp': '2026-10-20T02:55:00Z',
             'resetTime': 1792468800000},
            {'category': 'Claude/GPT', 'currentQuota': 0, 'timestamp': '2026-10-20T02:56:00Z'},
            {'category': 'Gemini', 'currentQuota': 1, 'timestamp': '2026-10-20T02:57:00Z'},
            {'category': 'Other', 'currentQuota': .4, 'timestamp': '2026-10-20T02:58:00Z'},
        ])
        before = self.db.read_bytes()
        ag = self.collect()[2]
        self.assertEqual(ag['usedPercent'], 100)
        self.assertEqual(ag['model'], 'Claude/GPT')
        self.assertEqual(len(ag['modelPools']), 4)
        self.assertEqual(ag['modelPools'][0]['usedPercent'], 20)
        self.assertTrue(ag['modelPools'][0]['resetAt'].endswith('+00:00'))
        self.assertEqual(self.db.read_bytes(), before)
        self.assertIsNone(ag['weeklyUsedPercent'])

    def test_missing_invalid_and_old_data_are_not_measured(self):
        self.write_ag([
            {'category': 'Gemini', 'currentQuota': .5, 'timestamp': '2026-10-20T01:00:00Z'},
            {'category': 'Other', 'currentQuota': True, 'timestamp': '2026-10-20T02:59:00Z'},
            {'category': 'Gemini Pro', 'currentQuota': 1.5, 'timestamp': '2026-10-20T02:59:00Z'},
        ])
        codex, claude, ag = self.collect()
        self.assertEqual(ag['quality'], 'stale')
        self.assertEqual(ag['usedPercent'], 50)
        for missing in (codex, claude):
            self.assertEqual(missing['quality'], 'unavailable')
            self.assertIsNone(missing['usedPercent'])
            self.assertIsNone(missing['weeklyUsedPercent'])

    def test_codex_uses_event_time_not_file_mtime_and_skips_bad_lines(self):
        root = self.home / '.codex/sessions'
        root.mkdir(parents=True)
        def event(timestamp, used):
            return json.dumps({'timestamp': timestamp, 'payload': {'type': 'token_count',
                'rate_limits': {'primary': {'used_percent': used, 'resets_at': 1792468800},
                                'secondary': {'used_percent': 12}}}})
        (root / 'a.jsonl').write_text(event('2026-10-20T02:59:00Z', 0) + '\n' + '{"token_count": "rate_limits" broken}\n')
        (root / 'b.jsonl').write_text(event('2026-10-20T01:00:00Z', 90))
        q = self.collect()[0]
        self.assertEqual(q['usedPercent'], 0)
        self.assertEqual(q['weeklyUsedPercent'], 12)
        self.assertEqual(q['quality'], 'measured')
        self.now += dt.timedelta(minutes=31)
        self.assertEqual(self.collect()[0]['quality'], 'stale')

    def test_claude_weekly_only_and_resets_without_credentials(self):
        path = self.home / '.claude/usage-dashboard-statusline.json'
        path.parent.mkdir()
        path.write_text(json.dumps({'observedAt': '2026-10-20T02:59:00Z', 'rate_limits': {
            'seven_day': {'used_percentage': 0, 'resets_at': '2026-10-23T00:00:00Z'}}}))
        q = self.collect()[1]
        self.assertEqual(q['quality'], 'measured')
        self.assertIsNone(q['usedPercent'])
        self.assertEqual(q['weeklyUsedPercent'], 0)
        self.assertEqual(q['weeklyResetAt'], '2026-10-23T00:00:00+00:00')

    def test_missing_and_corrupt_db_do_not_create_or_crash(self):
        self.collect()
        self.assertFalse(self.db.exists())
        self.db.write_text('not sqlite')
        self.assertEqual(self.collect()[2]['quality'], 'unavailable')

    def test_invalid_latest_pool_does_not_revive_older_measurement(self):
        self.write_ag([
            {'category': 'Gemini Pro', 'currentQuota': .2, 'timestamp': '2026-10-20T02:55:00Z'},
            {'category': 'Gemini Pro', 'currentQuota': 10, 'timestamp': '2026-10-20T02:59:00Z'},
        ])
        self.assertEqual(self.collect()[2]['quality'], 'unavailable')

    def test_claude_timestamp_and_thirty_minute_boundary(self):
        path = self.home / '.claude/usage-dashboard-statusline.json'
        path.parent.mkdir()
        snapshot = {'rate_limits': {'five_hour': {'used_percentage': 32}}}
        path.write_text(json.dumps(snapshot))
        self.assertEqual(self.collect()[1]['quality'], 'unavailable')
        snapshot['observedAt'] = '2026-10-20T02:30:00Z'
        path.write_text(json.dumps(snapshot))
        self.assertEqual(self.collect()[1]['quality'], 'measured')
        self.now += dt.timedelta(seconds=1)
        self.assertEqual(self.collect()[1]['quality'], 'stale')


if __name__ == '__main__':
    unittest.main()
