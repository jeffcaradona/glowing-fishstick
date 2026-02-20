# POC Positioning and Auth Roadmap

## Purpose

This document packages the current intent of the `glowing-fishstick` project for internal sharing. It is designed for coworkers who need a concise explanation of:

1. What this project is (and is not)
2. How to communicate release maturity (`0.1.0` vs `1.0.0`)
3. What the next high-value feature should be (pluggable auth with defaults + overrides)

---

## Project Positioning (Recommended Messaging)

`glowing-fishstick` should be presented as a **reference implementation / proof of concept** that demonstrates how an Express template can become a versioned, composable platform.

### Recommended one-liner

> "A practical PoC showing how our template model can evolve into composable npm packages with clear extension points."

### What this project demonstrates well

- Package-boundary-first architecture
- App and API factories with shared contracts
- Plugin/composition patterns for runtime customization
- Documentation-driven design and migration planning

### What this project is not claiming yet

- Full enterprise production hardening
- Finalized identity/access architecture
- GA-level operational guarantees

---

## Versioning Guidance

## `0.1.0` readiness signal

Use `0.1.0` when these conditions are true:

- The PoC narrative is stable and demonstrable end-to-end
- Key docs and examples are aligned with current package boundaries
- Planned immediate hardening tasks are either completed or explicitly tracked with clear scope
- The next extension point (auth) has a concrete contract direction

## `1.0.0` readiness signal

Use `1.0.0` only when:

- Project messaging no longer describes it as a PoC
- Operational/security defaults are intentionally hardened
- Extension contracts are stable and consumed by at least one real internal implementation
- Release and support expectations are documented and sustainable

---

## Next Big Feature: Pluggable Authentication

### Goal

Provide a default external authenticator (e.g., GitHub OAuth) in core while allowing consuming apps to override login behavior with custom providers (e.g., IIQ-like internal identity flow).

### Design principle

**Core provides contracts and sane defaults; apps choose identity strategy.**

### Target outcomes

- "Works out of the box" core auth provider
- App-level override points for routes, UI, claims mapping, and session handling
- No forks of core needed for internal auth customization

---

## Proposed Minimal Auth Contract (v1)

## Core API shape (concept)

```js
createApp(config, {
  auth: {
    providers: [githubProvider(), iiqProvider()],
    defaultProvider: 'github',
    loginRoute: '/login',
    callbackBasePath: '/auth/callback',
  },
});
```

## Provider contract (concept)

```js
{
  name: 'github',
  setup(app, ctx),
  getAuthorizationUrl(req, ctx),
  verifyCallback(req, ctx),
  mapUser(identity, ctx),
}
```

### App override examples

- Replace default login page with internal branded login
- Disable core `github` and register `iiq`
- Keep session/cookie primitives from core while changing identity source

---

## Suggested Rollout Plan

### Phase 1 — Contract + Skeleton (low risk)

- Add auth interfaces and no-op defaults in core
- Expose route registration hooks for `/login` and callback handling
- Add tests for deterministic async behavior and single-path error handling

### Phase 2 — GitHub Default Provider

- Implement external provider flow in core
- Add minimal docs for environment config and callback URLs
- Ensure request-path performance avoids blocking APIs

### Phase 3 — Custom Provider Override (IIQ-style)

- Implement app-side custom provider package/example
- Demonstrate override without modifying core internals
- Publish example flow diagram + claims mapping notes

### Phase 4 — Hardening and Readiness Review

- Validate rate limits/payload limits/error handling expectations
- Revisit versioning decision (`0.1.0` or later)
- Document support boundaries for internal adopters

---

## Internal Demo Talking Points

- "This proves we can ship the template as versioned modules instead of copy/paste repos."
- "Core owns stable contracts; apps own business-specific behavior."
- "Authentication is the next proof point: default external provider plus internal override path."
- "We can stop template drift while preserving team-level flexibility."

---

## Copy/Paste Summary for Team Chat

We should frame `glowing-fishstick` as a PoC/reference architecture, not a full production framework yet. The right next milestone is a pluggable auth contract: ship a default GitHub flow in core and allow app-level override for an internal IIQ-style login. That demonstrates the key platform value (stable core + customizable app behavior) and sets us up for a credible `0.1.0` milestone once docs/tests/hardening gates are aligned.
