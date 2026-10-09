# Google-only Access migration — 2026-10-10

Status: **PREPARED / NOT DEPLOYED**. Do not merge or deploy until Access policy and preview/production bypass checks are verified.

## Verified inventory
- Original ChatGPT Site: https://ai-automation-control-center-jp.hero511.chatgpt.site/ — HTTP 401 when signed out. Its ChatGPT Sites access layer is independent from this repository. Do not alter or delete it.
- Existing Cloudflare Pages: https://cloud-local-task-dashboard.pages.dev/ — HTTP 200; GitHub-backed project `cloud-local-task-dashboard`. Current UI fetches `/data/tasks.json`, not the operations Worker API.
- Existing Worker: https://ai-operations-state.univcorp2.workers.dev/v1/snapshot/latest — HTTP 200 JSON; schemaVersion=1, fields `generatedAt`, `tasks`, `agents`. This endpoint and its Windows producer must remain unchanged. It currently responds without authentication; protecting only the dashboard does **not** make direct API access private.
- The exact source repo of ChatGPT Site and state Worker remains unverified. Do not claim this repo replaces the ChatGPT Site UI 1:1.
- CLI Wrangler is authorized under an account, but the observed scopes do not list Cloudflare Access policy / IdP administration. Do not assume the right to configure Access.
- This repo's current static dashboard has no ChatGPT login dependency; the 401 is at the separate ChatGPT Site origin.

## Target design (safest migration)
1. Prefer **a new protected production hostname** for the existing Pages UI, keeping `*.chatgpt.site`, existing `*.pages.dev` and Worker untouched during the migration. Never expose the live operations snapshot behind a public preview.
2. Cloudflare Zero Trust > Settings > Authentication: Google IdP, configured with Google OAuth credentials by account owner. Restrict Access login methods for this application to Google. The login screen may be Cloudflare-branded before redirecting to Google.
3. Access self-hosted app matching the **exact production hostname**. Policy: Allow only explicitly authorized exact Google email addresses (not all Google users or the entire `gmail.com` domain); block others. No Bypass or broad Everyone allow rule. Require identity verification and session expiry.
4. Guard the **Pages preview URLs and default pages.dev URL** as well, or do not ship sensitive data on them. An Access policy only on a custom hostname is insufficient if `pages.dev` remains publicly reachable. Check static `/data/tasks.json` and `/api/*`, not just `/`.
5. Add the operations API adapter only after access protection has been shown to cover both HTML and JSON routes. Keep old `/data/tasks.json` available as a fallback. **Do not edit or redeploy the existing operations Worker**. If an authenticated Pages proxy is used, serve it only under the guarded application and disable caching of sensitive data.
6. If direct API access must become private, plan a separate migration for authorized producers/consumers, e.g. Service Tokens or a dedicated protected read endpoint. Never apply Access to existing Worker production routes without an inventory of machine clients.
7. Explicit permitted emails and Cloudflare Zone/hostname must be verified before enforcement. Do not guess the final allowlist.

## Acceptance and rollback
- Signed-out fresh browser: app HTML, `/data/tasks.json`, and all operational API paths reject unauthenticated access, with Google-login flow available.
- Signed-in **allowlisted** Google identity: real dashboard visible; latest Worker snapshot is mapped to actual task rows, with source timestamp and error/staleness state.
- Signed-in **non-allowlisted** Google identity: denied (not merely hidden in client JS).
- Production Pages, default `pages.dev`, custom hostname, and preview deployment paths checked for bypass. Confirm session logout/re-authentication.
- State Worker `/v1/snapshot/latest` remains readable by pre-existing consumers; validate status and schema before/after.
- Rollback: remove the **new** Access application/hostname routing and restore the previous Pages deployment or main ref, leaving ChatGPT Site and Worker intact. Save project ID, previous deployment ID and policy IDs before change.
- Record all test URLs (no session tokens or private payloads), redacted request statuses, commit SHA, deployment ID, policy IDs, permitted email identifiers, and timestamp in Notion.

## Blockers observed
- Google IdP / Access app settings and existing allowlist are not yet verified.
- Current OAuth scopes did not show Access policy administration.
- The present Pages site and raw Worker API are HTTP 200 when unauthenticated.
- No Google/non-allowlisted real-browser E2E has been executed. Mark these tests NOT RUN, not PASS.

Sources: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/ ; https://developers.cloudflare.com/cloudflare-one/access-controls/policies/ ; https://developers.cloudflare.com/workers/configuration/cloudflare-access/
