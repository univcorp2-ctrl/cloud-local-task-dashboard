import unittest
from collect_development_progress import evidence_record, MILESTONES

class ProgressAuditTests(unittest.TestCase):
    def test_weights_reconcile(self):
        self.assertEqual(sum(x[2] for x in MILESTONES), 100)

    def test_empty_repo_is_not_fabricated(self):
        repo={"name":"empty","isPrivate":True,"url":"https://github.com/u/empty",
              "defaultBranchRef":{"target":{"committedDate":"2026-01-01T00:00:00Z","tree":{"entries":[]}}}}
        item=evidence_record(repo,{"category":"research"},[],"2026-10-21T00:00:00Z")
        self.assertEqual(item["progressPercent"],0)
        self.assertEqual(item["actionStatus"],"investigated_pending_execution")
        self.assertTrue(all(not m["verified"] for m in item["milestones"]))

    def test_repo_with_code_and_tests_is_not_marked_tested(self):
        repo={"name":"sample-tool","isPrivate":False,"url":"https://github.com/u/sample-tool",
              "defaultBranchRef":{"target":{"tree":{"entries":[{"name":a} for a in ("README.md","src","tests","scripts")]}}}}
        item=evidence_record(repo,{"category":"other"},[],"2026-10-21T00:00:00Z")
        self.assertEqual(item["progressPercent"],60)
        self.assertFalse(next(m for m in item["milestones"] if m["id"]=="tests_pass")["verified"])
        self.assertFalse(next(m for m in item["milestones"] if m["id"]=="outcome")["verified"])

    def test_outcome_not_auto_from_zero_exit(self):
        repo={"name":"my-tool-proxy","isPrivate":False,"url":"https://github.com/u/my-tool-proxy",
              "defaultBranchRef":{"target":{"tree":{"entries":[{"name":"src"}]}}}}
        jobs=[{"name":"sample","executable":"python","arguments":"run/my-tool-proxy/main.py",
               "health":"last_exit_zero_unverified"}]
        item=evidence_record(repo,{"category":"control"},jobs,"2026-10-21T00:00:00Z")
        self.assertTrue(next(m for m in item["milestones"] if m["id"]=="runtime")["verified"])
        self.assertFalse(next(m for m in item["milestones"] if m["id"]=="outcome")["verified"])
        self.assertLess(item["progressPercent"],100)

if __name__ == "__main__":
    unittest.main()
