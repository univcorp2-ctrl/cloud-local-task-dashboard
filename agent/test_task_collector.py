import subprocess
import unittest
from unittest.mock import patch

from task_collector import parse_crontab
import task_collector


class CollectorTests(unittest.TestCase):
    def test_parse_crontab_ignores_comments_and_variables(self):
        tasks = parse_crontab('# comment\nSHELL=/bin/bash\n*/5 * * * * /usr/local/bin/health-check\n', 'server-1')
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0].schedule, '*/5 * * * *')
        self.assertEqual(tasks[0].host, 'server-1')

    @unittest.skipUnless(hasattr(subprocess, 'CREATE_NO_WINDOW'), 'Windows-only behavior')
    @patch('task_collector.subprocess.run')
    def test_run_hides_console_subprocesses_on_windows(self, run_mock):
        run_mock.return_value.returncode = 0
        run_mock.return_value.stdout = 'ok'

        self.assertEqual(task_collector.run(['schtasks', '/Query']), 'ok')

        kwargs = run_mock.call_args.kwargs
        self.assertTrue(kwargs['creationflags'] & subprocess.CREATE_NO_WINDOW)
        self.assertTrue(kwargs['startupinfo'].dwFlags & subprocess.STARTF_USESHOWWINDOW)
        self.assertEqual(kwargs['startupinfo'].wShowWindow, subprocess.SW_HIDE)
        self.assertIs(kwargs['stdin'], subprocess.DEVNULL)


if __name__ == '__main__':
    unittest.main()
