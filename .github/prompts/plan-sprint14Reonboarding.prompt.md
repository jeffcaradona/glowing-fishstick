# Plan: Sprint 14 — Re-onboarding

After ~3 months away, scope is reduced to **re-onboarding only**. No new features, no API surface changes. Goal: confirm the repo still builds green, refresh the mental model from canonical docs, and leave a one-paragraph "where things stand" note. Health Check Extensibility, ALS spike, and API Access Stage D are all explicitly **deferred** (the previous plan is preserved in the session memory file for when scope ramps back up).

## Steps

1. **Environment sanity** — Confirm Node ≥ 22 (`node -v`) and a clean `npm install` at the workspace root. Stop and report if either fails; no auto-upgrades.
2. **Green-build gate** — Run, in order: `npm run lint`, `npm run format` (check-only if available), `npm run test:all`. Capture failures verbatim. *Depends on step 1.*
3. **Triage failures (only if step 2 failed)** — Classify each failure as (a) trivial drift (lint rule update, snapshot, flaky test) → fix in place, or (b) non-trivial → stop and surface to the user before touching code. Re-run the gate after fixes.
4. **Doc-staleness scan** — Run the AGENTS.md validation commands:
   - `rg "from '../../index.js'|npm install glowing-fishstick|./src/app.js|./src/server.js" README.md sandbox/app/DEV_APP_README.md documentation/*.md`
   - `rg -n "\b(readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|execSync|spawnSync|pbkdf2Sync|scryptSync)\b" core/*/src sandbox/*/src`
   Report hits; do **not** fix anything unless it's a one-line obvious typo.
5. **Refresh context** — Re-read (no edits): [AGENTS-readable.md](AGENTS-readable.md), [CLAUDE.md](CLAUDE.md), [documentation/99-potential-gaps.md](documentation/99-potential-gaps.md), the most recent entries in [documentation/glowing-fishstick_project_gantt.mmd](documentation/glowing-fishstick_project_gantt.mmd), and each package's `CHANGELOG.md` for the last released version.
6. **Leave a "where things stand" note** — Update only the top of [documentation/99-potential-gaps.md](documentation/99-potential-gaps.md) (or add a dated bullet under the existing "Post-release next-step focus" block): re-onboarding date, build/test result, any drift observed, and that Health Check Extensibility remains the next intended feature. Single short paragraph. No restructuring.

## Relevant Files (read-only unless noted)

- [package.json](package.json) — workspace scripts.
- [AGENTS-readable.md](AGENTS-readable.md), [CLAUDE.md](CLAUDE.md) — canonical rules refresher.
- [documentation/99-potential-gaps.md](documentation/99-potential-gaps.md) — **only file edited** (step 6).
- [documentation/glowing-fishstick_project_gantt.mmd](documentation/glowing-fishstick_project_gantt.mmd) — read for project state.
- `core/*/CHANGELOG.md`, `core/modules/*/CHANGELOG.md` — last-released summaries.

## Verification

1. `npm run lint` exits 0.
2. `npm run test:all` exits 0; no new skipped suites vs. `main`.
3. Doc-staleness `rg` commands return no hits (or only previously-known intentional hits).
4. [documentation/99-potential-gaps.md](documentation/99-potential-gaps.md) shows one dated re-onboarding note; no other files changed.
5. `git status` otherwise clean — no stray edits, no `package-lock.json` churn beyond what `npm install` legitimately produced.

## Decisions

- **Deferred per user direction**: full Health Check Extensibility feature, AsyncLocalStorage design + spike, API Access Stage D observation kickoff.
- **No dependency upgrades** in this sprint. If something's broken from upstream churn, surface it — don't bandage it.
- **Single-file edit budget**: only step 6 writes to a tracked file. Anything beyond that is out of scope and gets a follow-up note instead of a fix.

## Further Considerations

1. **If `npm install` produces a noisy `package-lock.json` diff** — recommend: stop, show the diff, ask before committing. *(Option A: commit lockfile churn / Option B: investigate first.)* Recommend B.
2. **If tests reveal more than trivial drift** — recommend: stop after triage classification and return a short failure report rather than expanding scope mid-sprint.
3. **Next-sprint sizing** — decide based on how this gate goes: stay this small again, or step up to the "dedupe health routes only" refactor (next smallest win) before tackling the full Health Check Extensibility feature.
