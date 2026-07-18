#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
PYTHON="${PYTHON_BIN:-python3}"
COLLECTOR="$ROOT/agent/task_collector.py"
OUTPUT="$ROOT/public/data/tasks.json"
PUBLISH=""
if [[ -n "${TASK_DASHBOARD_GITHUB_TOKEN:-}" && -n "${TASK_DASHBOARD_REPOSITORY:-}" ]]; then PUBLISH=" --publish"; fi
COMMAND="cd '$ROOT' && '$PYTHON' '$COLLECTOR' --output '$OUTPUT'$PUBLISH >> '$ROOT/agent/agent.log' 2>&1"
if [[ "$(uname -s)" == "Darwin" ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.taskcontrolcenter.agent.plist"
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>com.taskcontrolcenter.agent</string><key>ProgramArguments</key><array><string>/bin/bash</string><string>-lc</string><string>$COMMAND</string></array><key>StartInterval</key><integer>300</integer><key>RunAtLoad</key><true/></dict></plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
else
  (crontab -l 2>/dev/null | grep -v 'task_collector.py' || true; echo "*/5 * * * * $COMMAND") | crontab -
fi
echo 'Task Control Center agent installed.'
