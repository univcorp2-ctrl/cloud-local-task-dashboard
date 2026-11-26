# Private execution visibility

`src/ExecutionPanel.tsx` renders D1 run evidence and unresolved replies through
the owner-only `/api/private-execution` endpoint. `HIRO_DATA` binds the existing
hiro-data database. Apply Agent_Orchestration's `009_execution_visibility.sql`
before deploying. Agent credentials cannot read this endpoint.

Missing observations, future dates and observations at least 24 hours old are red.
Fresh failed/blocked/uncertain runs are also red; partial runs are yellow.
Missing, failed, stale or incomplete Gmail collection is visible separately from
the pending count. LINE and Messenger direct collection remains disconnected.
No customer bodies or identities are copied to public static assets.

This branch does not prove adoption by every AI runtime or complete inbox
coverage. The common writer and inbox importer live in Agent_Orchestration on
`feature/ai-execution-visibility-20261126`; all import commands default to dry-run.

Validation: Vitest, app tsc, Functions tsc and Vite build. Anonymous/agent reads,
24h boundary, storage failures and incomplete inbox coverage have regression tests.
