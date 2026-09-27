# Archive

Historical planning/audit documents, frozen at the date noted on each file. None
of these are maintained going forward — treat them as a snapshot of what was true
when they were written, not as current status. For current status, see the
top-level `ROADMAP.md` and `CLAUDE.md`.

- **`AUDIT-v1.2.md`** (2026-03-22) — first comprehensive audit, 31/35 findings
  fixed at the time. Some items it lists as still open (e.g. the `real`→`numeric`
  column migration) have since been resolved in the code; don't use its tally as
  a current count.
- **`CDC.md`** — original spec / cahier des charges.
- **`DECISIONS.md`** — early architecture decision log.

## Later audit — 2026-09-27 (internal tracking: TIA-68)

A second full-repo audit ran on 2026-09-27 against `main` @ `042937d` (v2.51.7).
Verdict: the code is clean on the form side (typecheck, lint, 815 unit tests,
zero dependency cycles), but it surfaced functional/operational issues —
notably an admin-escalation bug via an unvalidated `isAdmin` signup field, an
unauthenticated Sentry webhook, silent trip loss on save failure past ~2h45,
and several stale docs (the same "12 badges", `real`/`numeric`, and CI/backup
claims fixed in this archive pass). It also flagged that this repo's
`CLAUDE.md` used to publish infrastructure access details (server IP, SSH
user, Coolify admin email, app/DB container UUIDs) on a **public** repo —
that section has been removed from `CLAUDE.md` and moved to internal team
memory.

The findings were split into seven follow-up work items tracked internally
(TIA-70 through TIA-76); this archive pass and the doc corrections in
`CLAUDE.md`/`README.md`/`ROADMAP.md` are the output of one of them (doc
cleanup + infra-info removal). The full audit report and a repo knowledge
graph (endpoints, schema, module dependency hubs) are kept in the internal
issue tracker, not in this repo, since they reference infrastructure and
in-progress security details.
