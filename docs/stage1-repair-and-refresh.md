# Stage 1 — Inventory refresh & direct Pages publish

The existing Pages dashboard is deployed at https://cloud-local-task-dashboard.pages.dev.

## Observed production checks (Oct 19, 2026)
- GitHub full inventory 153 repositories, 60 private, grouped into 13 categories.
- Windows non-Microsoft scheduled tasks 110–112, depending on new tasks.
- The independent AI state Worker observes only seven AI jobs; 30-day token total around 5,052,660. This is not a user’s total subscription usage.
- Quota/remaining percentages are **unavailable** for Codex, Claude Code, Gemini and ChatGPT normal Chat. Do not infer a quota from historical usage.
- Notion user-managed tasks belong to `#my-tasks`; direct API may still return 503 until backend OAuth/integration setup. Keep its source links available.

## Schedule and safety
The versioned script `scripts/refresh_inventory_and_publish.py` is intended for local Windows Task Scheduler with `pythonw.exe`. It performs:
1. GitHub authenticated inventory and local Windows Task Scheduler collection,
2. redacts private repository names and task actions from public JSON; stores full details in a private Google Drive folder,
3. builds the existing Vite site and uploads through an **already authorized** Wrangler installation,
4. checks the real Cloudflare production JSON using Windows PowerShell because Python urllib is blocked by Cloudflare bot controls on this host,
5. mirrors only public-redacted JSON into the existing Google Drive repo folder.

**No secrets** are written to GitHub, Notion, public JSON or logs. It does not automatically patch other repositories, change task execution owners, or claim 0 exit = business completion.

The script’s default private path is `G:/マイドライブ/AI_Agents/Private/`.
Logs are `repo-dashboard-refresh.log`; inventory is `repo-repair-inventory-latest.json`.

Cloudflare Pages Git-connected Builds and GitHub Actions have existing failures independent of this successful local direct publish. Do not represent the CI checks as passing.

## Manual validation
`python -m unittest discover -s scripts -p 'test_audit_*.py'`
`pnpm install --frozen-lockfile`
`pnpm run lint && pnpm test && pnpm run build`
`python scripts/refresh_inventory_and_publish.py`

After deployment check:
- `/data/operations-catalog.json` reports all 153 repositories in 13 groups (private names redacted)
- `/data/tasks.json` has the actual anonymized local task count
- `/api/token-usage` responds `application/json` with AI usage
- `/#automation` and `/#my-tasks` retain separate navigation

If a scheduled run fails, do not modify or delete the previously working live deployment; inspect the private log and restore the latest successful Cloudflare Pages deployment as appropriate.
