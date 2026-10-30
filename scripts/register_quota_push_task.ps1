<#
  Task Control Center — AI残量push定期タスク登録（30分ごと）
  旧 Univ-AI-Quota-Lightweight（サイト再デプロイ方式）を置き換える。
  使い方: powershell -ExecutionPolicy Bypass -File .\scripts\register_quota_push_task.ps1 [-Remove]
#>
param([string]$TaskName = "TCC-Quota-Push", [int]$Minutes = 30, [switch]$Remove)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $RepoRoot "scripts\run_quota_push.ps1"
if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false; Write-Host "[OK] removed $TaskName" }
  return
}
if (-not (Test-Path $Runner)) { throw "runner not found: $Runner" }
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Runner`"" -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "AI残量(Codex/Claude/Antigravity/Muse)をTask Control Center APIへ30分ごとにpush" -RunLevel Limited | Out-Null
Write-Host "[OK] $TaskName registered: every $Minutes minutes"
