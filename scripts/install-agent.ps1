param(
  [string]$RepositoryRoot = (Resolve-Path "$PSScriptRoot\.."),
  [int]$IntervalMinutes = 5
)
$ErrorActionPreference = 'Stop'
$Python = (Get-Command python -ErrorAction Stop).Source
$Collector = Join-Path $RepositoryRoot 'agent\task_collector.py'
$Output = Join-Path $RepositoryRoot 'public\data\tasks.json'
$Publish = if ($env:TASK_DASHBOARD_GITHUB_TOKEN -and $env:TASK_DASHBOARD_REPOSITORY) { ' --publish' } else { '' }
$Action = New-ScheduledTaskAction -Execute $Python -Argument "`"$Collector`" --output `"$Output`"$Publish" -WorkingDirectory $RepositoryRoot
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'TaskControlCenterAgent' -Action $Action -Trigger $Trigger -Principal $Principal -Description 'Collect local scheduled tasks for Task Control Center' -Force | Out-Null
Write-Host 'TaskControlCenterAgent を登録しました。5分以内に最初のスナップショットが作成されます。'
