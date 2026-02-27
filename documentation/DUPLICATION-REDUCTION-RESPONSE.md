# Response: Duplication Reduction Proposal

**Date:** 2026-02-27
**Status:** Decided — Decline Implementation
**In response to:** [DUPLICATION-REDUCTION-PROPOSAL.md](./DUPLICATION-REDUCTION-PROPOSAL.md)

---

## Decision

**Do not implement the proposed refactoring.** The current intentional-separation policy in AGENTS.md stands as-is.

The analysis in the proposal is thorough and the technical reasoning is sound, but the "slept on it" addendum at the end of the proposal is the correct conclusion: we should not let SonarCloud's duplication metric design the system.

---

## Why

### The numbers don't justify the work

- **Main branch overall duplication: <3%.** This is a healthy number for a monorepo with intentional separation between app and API packages.
- **PR duplication after two rounds of refactoring: >8%.** Two iterations of refactoring to reduce duplication actually increased the metric. We were chasing an impossible number — the free SonarCloud threshold is not calibrated for our architecture.

When the fix is worse than the finding, the finding is not actionable.

### This is a POC, not a platform

Per [POC-POSITIONING-AND-AUTH-ROADMAP.md](./POC-POSITIONING-AND-AUTH-ROADMAP.md), `glowing-fishstick` is a **proof of concept / reference architecture**. Our golden path goals are:

1. Demonstrate composable npm package architecture
2. Complete security hardening
3. Ship pluggable auth as the next feature proof point
4. Maintain clear, auditable code that teams can learn from

Spending cycles on Sonar metric optimization does not advance any of these goals. It pulls focus toward platform-level polish that is premature for a POC. The risk is real: **POC turns into platform engineering** without delivering the core proof points first.

That said, this project will also serve as a foundation for internal homelab use — but even that use case benefits more from shipping features than from chasing duplication thresholds.

### Intentional duplication is a feature, not a bug

The AGENTS.md policy already documents *why* the flagged files are separate:

- **Factories** have load-bearing middleware-ordering differences. Abstracting them hides security-relevant configuration from audit view.
- **Security hardening tests** must independently prove each package's security contract. Shared test generators would obscure which implementation is under test.
- **Error handlers** diverge on response format (HTML vs JSON) by design.

The proposal itself validated these decisions — its own Section 1 concluded "No action required on factory files." The remaining savings from Sections 2 and 3 are marginal (~9-18 lines across test files, ~45 lines from health route stubs) and don't meaningfully change the Sonar outcome.

---

## Disposition of Each Proposal Section

### 1. Factory Files — Agree: Keep Separate

No disagreement. The proposal's own analysis confirms the current policy is sound. No action needed.

### 2. Security Hardening Tests — Decline

The proposal to use `verifyHealthEndpoints` and add `assertHealthAvailableAfterThrottle` is technically clean, but the absolute savings (~9-18 lines total) do not justify the change surface. The inline assertions are clear, readable, and independently auditable per test file. This is exactly the kind of refactoring that feels productive but doesn't move the project forward.

If a future contributor independently finds the inline health assertions burdensome while working on a real feature change, they can adopt the existing `verifyHealthEndpoints` helper at that point. No policy change or new helper functions are needed now.

### 3. Health Routes — Decline (for now)

The discovery that `core/app/src/routes/health.js` and `core/api/src/routes/health.js` are 100% identical is a valid finding. The re-export stub pattern would work. However:

- The absolute duplication is 49 lines per file — trivial in project context.
- The consolidation requires changes across 4+ files and package.json exports.
- There is no operational risk from the current state.
- The effort is better spent on security hardening and auth milestones.

If health routes diverge in the future (e.g., API adds dependency-check endpoints), having separate files will be the right call anyway. Consolidating now may create unnecessary churn later.

**Action:** Add health routes to the "Intentionally separate" section in AGENTS.md to document the current state and prevent future confusion. This is a documentation fix, not a code change.

---

## What We Should Do Instead

1. **Accept <3% overall duplication as healthy.** Document this as an acceptable threshold for this project's architecture.
2. **Keep the AGENTS.md intentional-separation policy unchanged.** It correctly explains why the flagged files are separate.
3. **Consider SonarCloud duplication exclusions** for test files and intentionally-separated code if the metric continues to create noise on future PRs.
4. **Stay on the golden path:** security hardening → pluggable auth → 0.1.0 readiness. Every hour spent on metric optimization is an hour not spent on these milestones.
5. **Use duplication as a signal, not a steering wheel.** This is the right framing from the proposal's own addendum and should be our standing policy.

---

## Closing Note

The proposal's analysis was valuable — it confirmed that our intentional-separation decisions are sound and that the shared extraction we've already done (factory-utils, admin-throttle, testing helpers) is the right level of consolidation. The "slept on it" section got it right: if we find ourselves inventing patterns just to appease a metric, we're overengineering.

Ship features. Keep the code boring and auditable. Let duplication metrics inform, not drive.
