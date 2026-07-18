#!/usr/bin/env python3
"""Cross-platform scheduled-task collector with optional GitHub publishing."""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import os
import platform
import re
import subprocess
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def task_id(prefix: str, value: str) -> str:
    return f"{prefix}-{hashlib.sha1(value.encode('utf-8')).hexdigest()[:12]}"


def run(command: list[str]) -> str:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=20, check=False)
        return result.stdout if result.returncode == 0 else ''
    except (OSError, subprocess.SubprocessError):
        return ''


@dataclass
class Task:
    id: str
    name: str
    source: str
    environment: str
    status: str
    schedule: str
    lastRun: str | None
    nextRun: str | None
    durationSeconds: int | None
    successRate: float
    command: str = ''
    host: str = ''
    detail: str = ''


def parse_crontab(text: str, host: str) -> list[Task]:
    tasks: list[Task] = []
    for index, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith('#') or '=' in line.split(' ', 1)[0]:
            continue
        parts = re.split(r'\s+', line, maxsplit=5)
        if len(parts) < 6:
            continue
        schedule = ' '.join(parts[:5])
        command = parts[5]
        tasks.append(Task(task_id('cron', f'{host}:{index}:{line}'), command[:70], 'local', host, 'scheduled', schedule, None, None, None, 100.0, command, host, 'user crontab'))
    return tasks


def collect_windows(host: str) -> list[Task]:
    output = run(['schtasks', '/Query', '/FO', 'CSV', '/V'])
    if not output:
        return []
    tasks: list[Task] = []
    for row in csv.DictReader(io.StringIO(output)):
        name = row.get('TaskName') or row.get('タスク名') or 'Windows Task'
        status_raw = (row.get('Status') or row.get('状態') or '').lower()
        status = 'running' if 'running' in status_raw or '実行中' in status_raw else 'paused' if 'disabled' in status_raw or '無効' in status_raw else 'scheduled'
        tasks.append(Task(task_id('windows', name), name, 'local', host, status, row.get('Schedule Type') or row.get('スケジュールの種類') or 'Windows Task Scheduler', row.get('Last Run Time') or row.get('前回の実行時刻'), row.get('Next Run Time') or row.get('次回の実行時刻'), None, 100.0, row.get('Task To Run') or row.get('実行するタスク') or '', host, 'Windows Task Scheduler'))
    return tasks


def collect_systemd(host: str) -> list[Task]:
    output = run(['systemctl', 'list-timers', '--all', '--no-pager', '--no-legend'])
    tasks: list[Task] = []
    for line in output.splitlines():
        parts = re.split(r'\s{2,}', line.strip())
        if len(parts) < 2:
            continue
        unit = parts[-2] if len(parts) >= 2 else parts[-1]
        tasks.append(Task(task_id('systemd', unit), unit, 'local', host, 'scheduled', 'systemd timer', None, None, None, 100.0, unit, host, line.strip()))
    return tasks


def collect_launchd(host: str) -> list[Task]:
    output = run(['launchctl', 'list'])
    tasks: list[Task] = []
    for line in output.splitlines()[1:]:
        parts = line.split('\t')
        if len(parts) < 3:
            continue
        pid, exit_code, label = parts[:3]
        status = 'running' if pid.strip().isdigit() else 'success' if exit_code.strip() == '0' else 'scheduled'
        tasks.append(Task(task_id('launchd', label), label, 'local', host, status, 'launchd', None, None, None, 100.0, label, host, f'last exit: {exit_code}'))
    return tasks


def api_json(url: str, token: str, headers: dict[str, str] | None = None) -> Any:
    request_headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'task-control-center/1.0'}
    if token:
        request_headers['Authorization'] = f'Bearer {token}'
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.loads(response.read().decode('utf-8'))


def collect_github() -> list[Task]:
    token = os.getenv('GH_TASK_SOURCE_TOKEN') or os.getenv('GITHUB_TOKEN', '')
    repos = os.getenv('GH_TASK_SOURCE_REPOS') or os.getenv('GITHUB_REPOSITORY', '')
    tasks: list[Task] = []
    for repo in [item.strip() for item in repos.split(',') if item.strip()]:
        try:
            workflows = api_json(f'https://api.github.com/repos/{repo}/actions/workflows?per_page=100', token).get('workflows', [])
            runs = api_json(f'https://api.github.com/repos/{repo}/actions/runs?per_page=100', token).get('workflow_runs', [])
        except (urllib.error.URLError, ValueError):
            continue
        latest_by_workflow: dict[int, dict[str, Any]] = {}
        for workflow_run in runs:
            latest_by_workflow.setdefault(workflow_run.get('workflow_id'), workflow_run)
        for workflow in workflows:
            latest = latest_by_workflow.get(workflow.get('id'), {})
            conclusion = latest.get('conclusion')
            run_status = latest.get('status')
            status = 'running' if run_status in {'queued', 'in_progress', 'waiting'} else 'failed' if conclusion in {'failure', 'cancelled', 'timed_out'} else 'success' if conclusion == 'success' else 'scheduled'
            tasks.append(Task(task_id('github', f"{repo}:{workflow.get('id')}"), workflow.get('name', 'GitHub workflow'), 'github', repo, status, workflow.get('path', 'GitHub Actions'), latest.get('run_started_at') or latest.get('created_at'), None, None, 100.0 if conclusion == 'success' else 0.0 if conclusion else 100.0, workflow.get('path', ''), 'github.com', latest.get('html_url', '')))
    return tasks


def collect_cloudflare() -> list[Task]:
    account = os.getenv('CF_ACCOUNT_ID', '')
    token = os.getenv('CF_API_TOKEN', '')
    if not account or not token:
        return []
    headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
    tasks: list[Task] = []
    try:
        scripts = api_json(f'https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts', '', headers).get('result', [])
    except (urllib.error.URLError, ValueError):
        return []
    for script in scripts:
        name = script.get('id') or script.get('etag') or 'worker'
        try:
            schedules = api_json(f'https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts/{name}/schedules', '', headers).get('result', [])
        except (urllib.error.URLError, ValueError):
            continue
        for schedule in schedules:
            cron = schedule.get('cron', 'cron trigger')
            tasks.append(Task(task_id('cloudflare', f'{name}:{cron}'), name, 'cloudflare', 'Cloudflare Workers', 'scheduled', cron, None, None, None, 100.0, name, 'cloudflare.com', 'Cron Trigger'))
    return tasks


def build_snapshot(cloud_only: bool = False) -> dict[str, Any]:
    host = platform.node() or platform.system()
    tasks: list[Task] = []
    agents: list[dict[str, Any]] = []
    if not cloud_only:
        system = platform.system().lower()
        local_tasks = collect_windows(host) if system == 'windows' else collect_launchd(host) if system == 'darwin' else collect_systemd(host)
        if system != 'windows':
            local_tasks.extend(parse_crontab(run(['crontab', '-l']), host))
        tasks.extend(local_tasks)
        agents.append({'id': task_id('agent', host), 'name': host, 'kind': platform.system(), 'status': 'online', 'lastSeen': now_iso(), 'taskCount': len(local_tasks)})
    github_tasks = collect_github()
    cloudflare_tasks = collect_cloudflare()
    tasks.extend(github_tasks + cloudflare_tasks)
    agents.extend([
        {'id': 'github', 'name': 'GitHub Actions', 'kind': 'Cloud workflow', 'status': 'online' if github_tasks else 'not-configured', 'lastSeen': now_iso() if github_tasks else None, 'taskCount': len(github_tasks)},
        {'id': 'cloudflare', 'name': 'Cloudflare Workers', 'kind': 'Cron Triggers', 'status': 'online' if cloudflare_tasks else 'not-configured', 'lastSeen': now_iso() if cloudflare_tasks else None, 'taskCount': len(cloudflare_tasks)},
    ])
    return {'generatedAt': now_iso(), 'redacted': True, 'agents': agents, 'tasks': [asdict(task) for task in tasks]}


def publish_snapshot(snapshot: dict[str, Any], path: str) -> None:
    token = os.getenv('TASK_DASHBOARD_GITHUB_TOKEN', '')
    repo = os.getenv('TASK_DASHBOARD_REPOSITORY', '')
    branch = os.getenv('TASK_DASHBOARD_BRANCH', 'main')
    if not token or not repo:
        raise RuntimeError('TASK_DASHBOARD_GITHUB_TOKEN and TASK_DASHBOARD_REPOSITORY are required for --publish')
    api_url = f'https://api.github.com/repos/{repo}/contents/{path}'
    sha = None
    try:
        existing = api_json(f'{api_url}?ref={branch}', token)
        sha = existing.get('sha')
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
    content = json.dumps(snapshot, ensure_ascii=False, indent=2).encode('utf-8') + b'\n'
    body: dict[str, Any] = {'message': 'chore: refresh task snapshot', 'content': base64.b64encode(content).decode('ascii'), 'branch': branch}
    if sha:
        body['sha'] = sha
    request = urllib.request.Request(api_url, data=json.dumps(body).encode('utf-8'), method='PUT', headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'task-control-center/1.0'})
    with urllib.request.urlopen(request, timeout=30):
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='public/data/tasks.json')
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--cloud-only', action='store_true')
    args = parser.parse_args()
    snapshot = build_snapshot(args.cloud_only)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if args.publish:
        publish_snapshot(snapshot, args.output.replace('\\', '/'))
    print(f'wrote {len(snapshot["tasks"])} tasks to {output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
