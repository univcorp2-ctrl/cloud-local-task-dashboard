import unittest
from task_collector import parse_crontab


class CollectorTests(unittest.TestCase):
    def test_parse_crontab_ignores_comments_and_variables(self):
        tasks = parse_crontab('# comment\nSHELL=/bin/bash\n*/5 * * * * /usr/local/bin/health-check\n', 'server-1')
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0].schedule, '*/5 * * * *')
        self.assertEqual(tasks[0].host, 'server-1')


if __name__ == '__main__':
    unittest.main()
