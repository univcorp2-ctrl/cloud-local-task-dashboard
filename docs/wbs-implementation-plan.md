# WBS implementation plan

Design: PR #36, `docs/WBS_VIEW_DESIGN.md`. Execute in the main agent, per Hiro's instruction.

- [x] Add failing tests for grouping, exclusions, JST deadlines, owner-only API/cache and UI refresh.
- [x] Extend the existing Notion mapper with priority group, archive and parent relations; preserve existing consumers.
- [x] Add read-only `/api/private-wbs`, authenticate before any cache read, reject data older than 180 seconds; manual refresh bypasses cache.
- [x] Add mobile-first `#wbs`, five collapsible pillars, Hiro actions, four-week due bars, Saturday markings and explicit review-source limitations. Poll every 60 seconds and on return to the page.
- [x] Run lint/test/build, deploy with explicit confirmation, verify production and freshness. No private static task fixture.
- [ ] Commit/push feature branch, open PR; preserve handoff and evidence in existing GitHub/Drive/Notion destinations. Record UNKNOWN where live evidence is unavailable.

Calendar-to-review-log reconciliation is unavailable in the current API; display only explicit Notion follow-up tasks and label the boundary.
