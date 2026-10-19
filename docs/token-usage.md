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
