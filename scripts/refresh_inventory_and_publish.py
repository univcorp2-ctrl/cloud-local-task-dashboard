#!/usr/bin/env python3
"""Refresh approved, redacted operations inventory and deploy existing Pages app.

Designed for Windows Task Scheduler + pythonw, no visible terminal.
Does not auto-edit third-party repositories or use ChatGPT Tasks.
"""
from __future__ import annotations
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PRIVATE = Path("G:/マイドライブ/AI_Agents/Private")
PRIVATE = Path(os.environ.get("AI_OPERATIONS_PRIVATE_DIR", str(DEFAULT_PRIVATE)))
URL = "https://cloud-local-task-dashboard.pages.dev"
LOG = PRIVATE / "repo-dashboard-refresh.log"
LOCK = ROOT / ".ops-refresh.lock"
FLAGS = getattr(subprocess, "CREATE_NO_WINDOW", 0)

def log(message: str):
    PRIVATE.mkdir(parents=True, exist_ok=True)
    line = f"{datetime.now(timezone.utc).isoformat()} {message}\n"
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line)

def command(args: list[str], limit: int):
    proc = subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=limit,
                          creationflags=FLAGS, stdin=subprocess.DEVNULL)
    if proc.returncode:
        log(f"FAILED stage={args[0]} exit={proc.returncode} (diagnostics stored locally)")
        raise RuntimeError(f"{Path(args[0]).name} failed exit {proc.returncode}")

def validate_public_snapshot() -> tuple[int, int]:
    catalog = json.loads((ROOT / "public/data/operations-catalog.json").read_text(encoding="utf-8"))
    tasks = json.loads((ROOT / "public/data/tasks.json").read_text(encoding="utf-8"))
    full = json.loads((PRIVATE / "repo-repair-inventory-latest.json").read_text(encoding="utf-8"))
    # Hard gate against exposing a private repo's name or URL in the public JSON.
    public_repos = [r for c in catalog["categories"] for r in c["publicRepositories"]]
    listed_names = {r["name"] for r in public_repos}
    listed_urls = {r["url"] for r in public_repos}
    for repo in full["repositories"]:
        if repo["private"] and (repo["name"] in listed_names or repo["url"] in listed_urls):
            raise RuntimeError("Private GitHub repository link leaked into public catalog")
    for task in tasks["tasks"]:
        if any(k in task for k in ("command", "arguments", "executable", "host", "schedulePath")):
            raise RuntimeError("Private task executable or host leaked into public task list")
    if catalog["totalRepositories"] < 1 or len(tasks["tasks"]) < 1:
        raise RuntimeError("Empty live inventory, refusing publication")
    return catalog["totalRepositories"], len(tasks["tasks"])

def wait_for_live(repo_count: int, task_count: int):
    # On this Windows host Python urllib is blocked by Cloudflare with HTTP 403,
    # whereas the approved Windows Invoke-RestMethod transport returns real JSON.
    # Never confuse client transport failures with an origin deployment failure.
    check = (
        "$ErrorActionPreference='Stop';"
        "$b='https://cloud-local-task-dashboard.pages.dev';"
        "$r=Invoke-RestMethod ($b+'/data/operations-catalog.json');"
        "$t=Invoke-RestMethod ($b+'/data/tasks.json');"
        "$u=Invoke-RestMethod ($b+'/api/token-usage');"
        "@{repo=[int]$r.totalRepositories; tasks=[int]@($t.tasks).Count;"
        "token=[long]$u.total30d}|ConvertTo-Json -Compress"
    )
    for _ in range(15):
        try:
            if os.name == "nt":
                probe = subprocess.run(
                    ["powershell", "-NoProfile", "-NonInteractive", "-Command", check],
                    capture_output=True, text=True, encoding="utf-8",
                    errors="replace", timeout=35, creationflags=FLAGS
                )
                if probe.returncode:
                    raise RuntimeError("public PowerShell HTTP probe unavailable")
                state = json.loads(probe.stdout.strip())
                if (state.get("repo") == repo_count and state.get("tasks") == task_count
                        and isinstance(state.get("token"), int)):
                    return
            else:
                with urlopen(URL + "/data/operations-catalog.json", timeout=12) as response:
                    c = json.load(response)
                with urlopen(URL + "/data/tasks.json", timeout=12) as response:
                    t = json.load(response)
                with urlopen(URL + "/api/token-usage", timeout=12) as response:
                    u = json.load(response)
                if (c.get("totalRepositories") == repo_count and
                        len(t.get("tasks", [])) == task_count and
                        isinstance(u.get("total30d"), int)):
                    return
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError("Cloudflare public E2E mismatch after deploy")

def main():
    if LOCK.exists():
        age = time.time() - LOCK.stat().st_mtime
        if age < 1800:
            log("SKIPPED: another refresh may be running")
            return 2
        LOCK.unlink()
    LOCK.write_text(str(os.getpid()), encoding="utf-8")
    try:
        log("START")
        command([sys.executable, "scripts/audit_all_repositories.py",
                 "--public-output", "public/data/operations-catalog.json",
                 "--private-output", str(PRIVATE / "repo-repair-inventory-latest.json"),
                 "--tasks-public-output", "public/data/tasks.json"], limit=160)
        # Refresh local non-secret quota observations before every deployment.
        # Unknown/expired readings remain explicitly unavailable; no credentials are read.
        command([sys.executable, "scripts/collect_ai_quotas.py",
                 "--catalog", "public/data/operations-catalog.json"], limit=45)
        repo_count, task_count = validate_public_snapshot()
        pnpm = shutil.which("pnpm.cmd") or shutil.which("pnpm")
        wrangler = shutil.which("wrangler.cmd") or shutil.which("wrangler")
        if not pnpm or not wrangler:
            raise RuntimeError("pnpm or wrangler binary not installed")
        command([pnpm, "run", "build"], limit=160)
        command([wrangler, "pages", "deploy", "dist",
                 "--project-name", "cloud-local-task-dashboard",
                 "--branch", "main", "--commit-message",
                 "Scheduled redacted inventory snapshot"], limit=240)
        wait_for_live(repo_count, task_count)
        # Local Google Drive mirror; private inventory remains only in Private path.
        mirror = Path("G:/マイドライブ/AI_Agents/github/repos/cloud-local-task-dashboard/public/data")
        if mirror.parent.exists():
            mirror.mkdir(parents=True, exist_ok=True)
            for name in ("operations-catalog.json", "tasks.json"):
                shutil.copy2(ROOT / "public/data" / name, mirror / name)
        log(f"PASS published repos={repo_count} tasks={task_count}")
        return 0
    except Exception as e:
        log("ERROR " + str(e)[:300])
        return 1
    finally:
        LOCK.unlink(missing_ok=True)

if __name__ == "__main__":
    sys.exit(main())
