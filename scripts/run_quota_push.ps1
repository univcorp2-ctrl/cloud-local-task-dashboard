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
try { git -C $root pull --ff-only --quiet origin main 2>$null | Out-Null } catch { }
$env:TCC_ACCESS_TOKEN = DecodeLocalSecret 'C:\AI-Agent\Private\tcc-secrets\access.dpapi'
try {
  & python (Join-Path $PSScriptRoot 'push_quota_state.py') --apply --log $log
  if ($LASTEXITCODE -ne 0) { throw "push exited $LASTEXITCODE" }
} finally {
  Remove-Item Env:TCC_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
