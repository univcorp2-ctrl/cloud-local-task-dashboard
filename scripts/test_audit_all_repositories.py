import unittest
from audit_all_repositories import category, report, public_task_snapshot

class InventoryTests(unittest.TestCase):
    def test_business_categories(self):
        self.assertEqual(category('FBAutoposter-Post10Monitor')[0], 'social')
        self.assertEqual(category('Shinchiku_Land_Searcher')[0], 'real_estate')
        self.assertEqual(category('Apple-Morimori-Buyback-ApprovalWatch')[0], 'commerce')
        self.assertEqual(category('ChatGPT-Supervisor-Resident-Watchdog')[0], 'chatgpt')
        self.assertEqual(category('Hojokin')[0], 'finance')

    def test_private_names_stay_private(self):
        repos = [
            {"name": "public-sample", "url": "https://github.com/x/public-sample",
             "private": False, "archived": False, "updatedAt": "", "description": "",
             "category": "real_estate", "classificationEvidence": "registered",
             "executionOwner": "unverified", "verification": "repository_detected_only"},
            {"name": "SECRET_INTERNAL_REPO_ONLY", "url": "https://github.com/x/private",
             "private": True, "archived": False, "updatedAt": "", "description": "PRIVATE-SECRET",
             "category": "real_estate", "classificationEvidence": "registered",
             "executionOwner": "unverified", "verification": "repository_detected_only"},
        ]
        public, private = report(repos, [])
        self.assertEqual(public["totalRepositories"], 2)
        self.assertEqual(public["privateRepositoryCount"], 1)
        self.assertEqual(len(private["repositories"]), 2)
        self.assertNotIn("SECRET_INTERNAL_REPO_ONLY", str(public))
        self.assertNotIn("PRIVATE-SECRET", str(public))
        self.assertNotIn("https://github.com/x/private", str(public))

    def test_task_redaction(self):
        tasks = [{
            "name": "VERY_PRIVATE_TASK_NAME", "schedulePath": "C:/secret",
            "executable": "C:/SecretFolder/python.exe",
            "arguments": "--api-key VERY_PRIVATE_TOKEN_VALUE",
            "category": "social", "health": "needs_review",
        }]
        snapshot = public_task_snapshot(tasks, "2026-10-19T00:00:00+00:00")
        result = str(snapshot)
        for forbidden in ["VERY_PRIVATE_TASK_NAME", "VERY_PRIVATE_TOKEN_VALUE", "SecretFolder", "C:/secret"]:
            self.assertNotIn(forbidden, result)
        self.assertEqual(snapshot["tasks"][0]["status"], "failed")
        self.assertEqual(snapshot["tasks"][0]["successRate"], -1)
        self.assertEqual(snapshot["tasks"][0]["source"], "local")

    def test_quota_unknown_not_estimated(self):
        public, _ = report([], [])
        self.assertTrue(all(entry["remainingPercent"] is None for entry in public["quotas"]))

if __name__ == "__main__":
    unittest.main()
