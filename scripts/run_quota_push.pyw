"""Windowless Task Scheduler entrypoint; no console child may create a window."""
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
result = subprocess.run(
    ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
     '-File', str(root / 'run_quota_push.ps1')],
    cwd=root.parent, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW,
)
raise SystemExit(result.returncode)
