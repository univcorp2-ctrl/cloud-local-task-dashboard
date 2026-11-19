import datetime as dt
import unittest
from background_usage import summarize

class BackgroundUsageTests(unittest.TestCase):
    def test_dedupe_week_and_provider_calibration(self):
        rows = [dict(provider='claude', process='a', run_id='1', at='2026-11-17T00:00:00Z', tokens=100)]
        rows += rows[:]
        rows += [dict(provider='claude', process='b', run_id='2', at='2026-11-18T00:00:00Z', tokens=300),
                 dict(provider='claude', process='a', run_id='old', at='2026-11-10T00:00:00Z', tokens=999)]
        result = summarize(rows, '2026-11-16T00:00:00+09:00', {'claude': {'used_percent': 40, 'coverage_complete': True}})
        self.assertEqual(result[0]['tokens'], 100)
        self.assertEqual(result[0]['quota_percent'], 10)
        self.assertEqual(result[1]['quota_percent'], 30)

    def test_incomplete_coverage_never_invents_quota(self):
        row = dict(provider='claude', process='a', run_id='1', at='2026-11-17T00:00:00Z', tokens=100)
        self.assertIsNone(summarize([row], '2026-11-16', {'claude': {'used_percent': 40}})[0]['quota_percent'])

    def test_conflicting_run_and_bad_numbers_fail_closed(self):
        row = dict(provider='claude', process='a', run_id='1', at='2026-11-17T00:00:00Z', tokens=100)
        with self.assertRaises(ValueError): summarize([row, {**row, 'tokens': 200}], '2026-11-16', {})
        with self.assertRaises(ValueError): summarize([{**row, 'tokens': -1}], '2026-11-16', {})

if __name__ == '__main__': unittest.main()
