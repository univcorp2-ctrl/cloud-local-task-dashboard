# AI quota collection and display

> **2026-10-31 update (owner decision):** live quotas are collected by `scripts/push_quota_state.py`
> (task `TCC-Quota-Push`, every 30 min) and stored in the KV state API (`/api/state`).
> Claude is read from the account usage endpoint with the OAuth token Claude Code keeps in
> `~/.claude/.credentials.json` (local, read-only; an expired token is refreshed by running
> `claude -p` once so Claude Code rewrites its own file). Antigravity is read from the running
> IDE's local language_server (`GetUserStatus` → per-model `quotaInfo`). Codex and Muse as before.
> Only percentages and reset times leave the PC. The sections below describe the legacy
> static-catalog path, which remains as a fallback.

Quota telemetry uses local observations only. Run the collector against a private
copy of the catalog to review its output before publishing:

```powershell
python scripts/collect_ai_quotas.py --catalog <catalog-copy.json>
```

`--home` selects fixture/user data; `--appdata` selects the roaming application-data
root. The collector does not modify CLI settings, scheduled tasks, OS environment,
Cloudflare secrets, or deployments. No new packages are required.

## Sources and freshness

- Codex: `~/.codex/sessions` and `archived_sessions`, bounded to 30 recently modified
  files and the last 4,000 lines each. Select the latest `token_count.rate_limits`
  by event timestamp across these files, not file modification time. Primary and
  secondary windows map to 5 hours and 7 days. No conversation fields are exported.
- Antigravity: `%APPDATA%/Antigravity/User/globalStorage/state.vscdb`, opened using
  SQLite URI `mode=ro`. Query only `ItemTable` key `crsx.ag-usage`. In its JSON
  `quotaHistory` array, choose the latest timestamp per category: `Gemini Pro`,
  `Claude/GPT`, `Gemini`, `Other`. Use `(1-currentQuota)*100` for finite numeric
  fractions in [0,1], including zero. Invalid latest observations are unknown;
  they do not revive earlier values. ISO timestamps and Unix seconds/milliseconds
  are normalized to UTC ISO strings. `resetTime` is converted when parseable.
  Show every available category in the details; the summary uses the highest usage
  across the latest category observations. It is a model pool, not a 5-hour or
  weekly total. Missing categories mean incomplete coverage, not zero usage.
- Claude: only `~/.claude/usage-dashboard-statusline.json`, described below.
- ChatGPT normal Chat: unavailable until a verifiable source is connected.

An observation older than 30 minutes is `quality: stale`; retained percentages are
historical values labeled `前回`, not current measured usage. If any participating
Antigravity pool is stale, its summary is stale. Missing/invalid timestamps and
observations more than five minutes in the future are unavailable. Collection time
is separate from observation time and cannot make old data fresh. Missing sources
clear old percentages instead of retaining cached `measured` values. Reset times
are not evidence of a new observation; no automatic reset-to-zero is invented.

The UI validates percentages, shows both window reset times, and recomputes
freshness on catalog polling. Legacy catalog entries without observation times
are unavailable. On narrow screens each provider remains a separate row, with
window columns beneath its name. Catalog category styles are independent.

## Claude sanitized snapshot contract

The official [Claude status line documentation](https://code.claude.com/docs/en/statusline)
describes JSON supplied on stdin to a local status line command. The collector
accepts its `rate_limits.five_hour` and `seven_day` fields independently. It never
reads credentials, cookies, keychains or OAuth storage and never calls an OAuth
usage endpoint. Context-window fullness and token/cost totals are not plan quotas.

An existing trusted status line helper may save only this allowlisted projection:

```json
{
  "observedAt": "2026-10-20T03:00:00Z",
  "rate_limits": {
    "five_hour": {"used_percentage": 42, "resets_at": 1792472400},
    "seven_day": {"used_percentage": 27, "resets_at": 1792710000}
  }
}
```

This is an example, not live usage. Add `observedAt` when the helper receives fresh
quota input; `timestamp` is also accepted. Write atomically to the snapshot path.
Do not refresh its timestamp by copying an old quota response. Never save the full
statusline input: it can contain workspace paths and other session metadata. No
helper is installed and no existing Claude configuration is changed by this task.
If the statusline emits no rate-limit fields, a window is absent, or the helper is
not connected, that usage stays unknown. A snapshot without a valid observation
time stays unavailable. `resets_at` accepts Unix seconds/milliseconds or a
 timezone-qualified ISO timestamp. No credential/API fallback is used.

## Verification

```powershell
pnpm lint
pnpm test
pnpm build
python -m unittest discover -s scripts -p 'test_*.py'
python -m unittest discover -s agent -p 'test_*.py'
```

Equivalent package scripts are `npm run lint`, `npm test`, `npm run build`.
Tests use synthetic homes and databases, including malformed/missing sources,
zero fractions, latest-per-category selection, stale snapshots, ISO resets,
read-only database preservation, weekly-only Claude input and UI availability.
