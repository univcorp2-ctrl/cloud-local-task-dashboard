# AI token usage panel

This extends the existing Cloud & Local Task Dashboard without replacing its scheduled-task collectors.

- The frontend loads **same-origin** `/api/token-usage` every 60 seconds; browsers cannot call the existing Operations Worker directly because it does not return an Access-Control-Allow-Origin header.
- Cloudflare Pages Function `functions/api/token-usage.ts` reads the existing publicly reachable Operations Worker and returns **only** 30-day aggregate, 24h/7d/30d per-task token counts, IDs, task/model/executor/status, and timestamp. It does not copy credentials, commands, paths, Google Drive names or system health internals.
- The 30-day headline is from Worker `tokenSummary.total`. The 24-hour and 7-day headline is summed across monitored tasks with populated records. All metrics are **partial observed usage, not billing**. If a task does not have a count, display **計測なし**, not zero.
- On 2026-10-19 11:55 JST the Worker returned 7 AI tasks, 1 with measured 30-day usage, 5,052,660 total tokens. The independent Windows Task Scheduler collector had 456 schedule records on the connected PC. The 7 AI tasks are **not** all 456 Windows tasks.
- No API keys or secrets are needed because this reads an already public Worker endpoint.
- For real API costs, connect the official organization-level billing/usage endpoint separately with a private backend and explicit account permissions. Never infer prices from historical CLI tokens or publish raw billing records.
- Run `npm run lint && npm test && npm run build`, and confirm production `/api/token-usage` returns 200 with the expected JSON fields after Pages deployment.
- Existing dashboard `/data/tasks.json` publishing is independent of the token endpoint. Do not claim that a local collector write to a Google Drive mirror means the public Pages site has refreshed.

## 2026-11-08: current per-provider attribution

The Overview uses authenticated `/api/state` usage for Claude, Codex, Antigravity and Muse. The four-provider headline averages their current weekly quota percentages equally (Antigravity uses the maximum model window). This is an index of quota utilization, **not a combined token budget**. A stale or missing provider makes the average unknown; dated provider observations remain labelled.

- Claude tasks come from `jobs[source=claude-cloud]`, populated by the existing Claude list_triggers sync. An empty live list stays empty; the legacy snapshot is a fallback only when that source is absent. Disabled jobs have zero weight. Enabled jobs use `runsPerWeek × durationSeconds`, allocating Cowork+Other account surface percentages. Missing durations leave attribution unknown. Rows are `quality=estimated`, with a warning when the job observation is older than 48 hours (or undated). Surface, CLI and scheduled rows overlap and must not be summed.
- Codex uses cumulative counter deltas within seven days, grouped by actual task prompt after injected AGENTS instructions. Token counts are measured; multiplying their shares by weekly quota is an attribution estimate.
- Antigravity reads seven-day token JSONL records from commerce usage and any existing `.antigravity*/sessions` or `logs` JSONL. It groups daily-content-engine, commerce-autopilot and interactive use. Audit publication totals marked as duplicates of agy_call are excluded. Estimated token sources retain estimated quality. Counts cover recorded activity only, and do not represent full account billing.
- Muse reads its existing Drive `token_status_payload.json`. `task_usage` / `tasks` items may supply tokens and percentages; otherwise only `Muse全体（自己申告）` is shown with weekly quota. No task-level tokens are invented.

Per-task columns show token count, quality, share within that AI's recorded scope, attribution to that AI's weekly quota, and last execution. Missing values stay 未計測. The old `/api/token-usage` Worker panel becomes muted, collapsed by default and labelled `旧データ（M/D時点・参考）` after three days. Expanding it is optional and never refreshes its timestamp.
