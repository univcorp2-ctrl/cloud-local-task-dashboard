# Push AI quota observations (Codex / Claude Code / Antigravity / Muse-from-Drive) to the
# Task Control Center state API every 30 minutes. No site rebuild, no deploy, no LLM call.
# The access token is DPAPI-encrypted for this Windows user; it exists only in this process.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function DecodeLocalSecret([string]$path) {
  $secure = (Get-Content -Raw -Encoding UTF8 $path).Trim() | ConvertTo-SecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$root = Split-Path $PSScriptRoot -Parent
$log = 'G:\マイドライブ\AI_Agents\Private\automation-control-center\quota-push.log'
function InvokeHidden([string]$exe, [string]$arguments) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $exe
  $info.Arguments = $arguments
  $info.WorkingDirectory = $root
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  if ($stdout.Result) { Write-Output $stdout.Result }
  # Do not expose arbitrary diagnostics from authenticated tools.
  $code = $process.ExitCode
  $process.Dispose()
  if ($code -ne 0) { throw "background child failed ($code)" }
}
try { InvokeHidden 'git.exe' 'pull --ff-only --quiet origin main' | Out-Null } catch { }
$env:TCC_ACCESS_TOKEN = DecodeLocalSecret 'C:\AI-Agent\Private\tcc-secrets\access.dpapi'
try {
  $collector = Join-Path $PSScriptRoot 'push_quota_state.py'
  InvokeHidden 'python.exe' ('"' + $collector + '" --apply --log "' + $log + '"')
} catch {
  Add-Content -Encoding UTF8 -LiteralPath $log -Value ((Get-Date -Format o) + ' | quota-push failed; inspect source availability / authentication')
  throw
} finally {
  Remove-Item Env:TCC_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
