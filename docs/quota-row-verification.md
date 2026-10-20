# Quota rows: local verification, 2026-10-20

Implemented the existing task specification in this checkout only. No commits,
pushes, merges, Pages deployments, Cloudflare secrets, credentials, scheduled-task
changes or OS configuration changes were performed.

## Kept changes

- `src/OperationsOverview.tsx`: provider rows, visible fetch errors and freshness
  recomputation on every poll, including repeated failures.
- `src/QuotaRow.tsx`: independent window percentages and resets, observation status,
  stale historical labeling and Antigravity pool details.
- `src/operations.css`: scoped responsive quota rows; category grid unchanged.
- `scripts/collect_ai_quotas.py`: bounded Codex event selection, read-only AG SQLite,
  sanitized Claude snapshot, timestamp normalization and availability handling.
- `src/OperationsOverview.test.tsx`, `scripts/test_collect_ai_quotas.py`: regressions.
- `docs/ai-quotas.md`, `README.md`: source and snapshot contract documentation.

## Validation and environment

Initial requested checks could not start: no checkout dependencies, broken inherited
NODE_OPTIONS (missing preload path), no pnpm executable, corepack network fetch
blocked (EACCES), and no Python registered with `py`. Existing C:/AI-Agent/.venv
points at a missing interpreter. No environment or OS settings were repaired.

For local verification only, copied existing dependency files from
`C:/AI-Agent/production/cloud-local-task-dashboard/node_modules` to this checkout's
ignored node_modules, then flattened its existing hoisted dependencies. Adjusted
only the ignored local Vitest command shim to use the same Vitest installation as
the tests (duplicate module instances initially prevented jest-dom matchers).
NODE_OPTIONS was cleared only in invoked check processes. Package files and the
lockfile were not changed. This is not a frozen-lockfile reinstall: reused tools
were Vitest 4.1.12 and Vite 8.3.4. Fresh dependency resolution remains UNKNOWN.

Used installed Python 3.12.13 at
`C:/Users/t0015/AppData/Roaming/uv/python/cpython-3.12.13-windows-x86_64-none/python.exe`.
The new collector tests first failed against the old collector's missing arguments,
then passed after implementation. No live private quota database/catalog was read
or overwritten; collector output was tested using synthetic fixtures.

Validation commands: npm run lint, npm test, npm run build; Python unittest discover
for scripts/test_*.py and agent/test_*.py. npm commands invoke the same package
scripts requested via pnpm. pnpm itself is unavailable in this restricted session.

Browser UI verification: UNKNOWN. The local Vite preview started, but Chrome MCP
new_page was rejected because it requires approval and approval policy is never.
Responsive CSS was reviewed statically; DOM behavior is covered by tests. No visual
or screenshot success is claimed. Production remains unchanged.

## Restart and next action

Read `docs/ai-quotas.md` for the full schema. Rerun the five commands above after
installing exact lockfile dependencies in an environment with package-manager
access. Then visually verify provider rows at desktop and narrow widths. Live
Claude snapshot availability and AG extension schema/coverage remain UNKNOWN until
verified with actual local quota-only sources. Any publication is a separate step.

KEEP: all source, regression and documentation files listed above. Ignored
node_modules and dist remain disposable local verification artifacts.
ARCHIVE: none. DELETE: none. FILEMAP.md was absent, so none was created.

Final results (2026-10-20): npm run lint PASS; npm test PASS (4 files,
12 tests); npm run build PASS; scripts Python suite PASS (11 tests);
agent Python suite PASS (2 tests); git diff --check PASS (line-ending notice
only). The Vite preview process was stopped after the browser approval rejection.
No source dependencies or lockfile changed. Vite 8.3.4 and Vitest 4.1.12 also match
the versions recorded in this checkout's pnpm-lock.yaml, but exact installed-tree
integrity was not established by a frozen install.
