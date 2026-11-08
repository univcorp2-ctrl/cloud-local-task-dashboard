import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

import collect_token_usage as ctu
import push_quota_state as pqs

NOW = dt.datetime(2026, 11, 8, 4, tzinfo=dt.timezone.utc)


class UsageSourcesTest(unittest.TestCase):
    def test_codex_window_uses_deltas_and_skips_injected_instructions(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d) / '.codex/sessions'
            folder.mkdir(parents=True)
            rows = [{'type': 'session_meta', 'payload': {'originator': 'codex_exec'}},
                    {'type': 'response_item', 'payload': {'type': 'message', 'role': 'user', 'content': [{'text': '# AGENTS.md instructions for C:\\AI-Agent'}]}},
                    {'type': 'response_item', 'payload': {'type': 'message', 'role': 'user', 'content': [{'text': '# Actual task'}]}}]
            for at, total in [('2026-10-30T00:00:00Z', 1000), (NOW.isoformat(), 1200)]:
                rows.append({'type': 'event_msg', 'timestamp': at, 'payload': {'type': 'token_count', 'info': {'total_token_usage': {'total_tokens': total}}}})
            (folder / 'run.jsonl').write_text('\n'.join(json.dumps(r) for r in rows))
            u = ctu.codex_usage(Path(d), NOW, 20)
        self.assertEqual(u['totalTokens'], 200)
        self.assertEqual(u['items'][0]['label'], 'Actual task')

    def test_live_empty_list_does_not_revive_snapshot(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'tasks.json'
            path.write_text(json.dumps({'tasks': [{'name': 'obsolete', 'runsPerWeek': 168, 'avgSeconds': 300}]}))
            tasks = pqs.live_claude_tasks({'jobs': [{'source': 'claude-cloud', 'observedAt': NOW.isoformat(), 'items': []}]}, path)
            u = ctu.claude_usage({'seven_day': {'utilization': 90}, 'seven_day_breakdown': {'rows': [{'key': 'cowork', 'percent': 70}]}}, Path(d), NOW, path, tasks)
            self.assertFalse(any(i['kind'] == 'scheduled' for i in u['items']))

    def test_disabled_and_stale_jobs(self):
        rec = {'source': 'claude-cloud', 'observedAt': '2026-11-02T00:00:00Z', 'items': [
            {'name': 'current', 'enabled': True, 'runsPerWeek': 7, 'durationSeconds': 60, 'lastFinishedAt': NOW.isoformat()},
            {'name': 'paused', 'enabled': False, 'runsPerWeek': 168, 'durationSeconds': 300}]}
        tasks = pqs.live_claude_tasks({'jobs': [rec]}, None)
        with tempfile.TemporaryDirectory() as d:
            u = ctu.claude_usage({'seven_day': {'utilization': 90}, 'seven_day_breakdown': {'rows': [{'key': 'cowork', 'percent': 70}]}}, Path(d), NOW, None, tasks)
        items = {i['label']: i for i in u['items'] if i['kind'] == 'scheduled'}
        self.assertEqual(items['current']['sharePercent'], 70)
        self.assertEqual(items['paused']['quotaPercent'], 0)
        self.assertEqual(items['current']['quality'], 'estimated')
        self.assertIn('11/2', items['current']['note'])
        self.assertEqual(items['current']['lastAt'], NOW.isoformat())

    def test_antigravity_window_and_audit_not_double_counted(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'usage.jsonl'
            events = [
                {'at': NOW.isoformat(), 'event': 'agy_call', 'engine': 'daily-content-engine', 'input_tokens': 100, 'output_tokens': 10},
                {'at': NOW.isoformat(), 'event': 'published', 'engine': 'daily-content-engine', 'article': 'a', 'input_tokens': 100, 'output_tokens': 10, 'token_basis': 'actual_audit; original generation in agy_call records'},
                {'at': NOW.isoformat(), 'event': 'error', 'engine': 'commerce-autopilot', 'input_tokens': 20, 'output_tokens': 5},
                {'at': '2026-10-01T00:00:00Z', 'event': 'published', 'input_tokens': 999}]
            path.write_text('\n'.join(json.dumps(e) for e in events))
            u = ctu.antigravity_usage(Path(d), NOW, 2.5, path)
        self.assertEqual(u['totalTokens'], 135)
        self.assertEqual(len(u['items']), 2)
        self.assertEqual(u['basis'], 'tokens')

    def test_muse_total_preserves_source_time(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'muse.json'
            path.write_text(json.dumps({'updated_at': NOW.isoformat(), 'weekly_free_limit': {'remaining_percent': 0}}))
            u = ctu.muse_usage(path, NOW, 100)
        self.assertEqual(u['items'][0]['key'], 'muse-total')
        self.assertEqual(u['items'][0]['quotaPercent'], 100)
        self.assertEqual(u['items'][0]['quality'], 'self_reported')
        self.assertIsNone(u['items'][0]['tokens'])
