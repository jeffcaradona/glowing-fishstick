# Copilot Instructions: Documentation, Organization, and Performance Guardrails

All coding constraints, performance rules, and review checklists are defined in `AGENTS.md` (root). Those rules are **non-negotiable** and apply to all code changes. Key areas covered there: documentation sync rules, event-loop safety, I/O patterns, CPU-bound work, async consistency (Zalgo prevention), V8 optimization, logging, PR checklists, code commenting (WHY-comments), architecture constraints, and validation commands.

This file exists to confirm Copilot follows `AGENTS.md` without exception.

For performance-sensitive changes, include a brief note in PR description about expected latency/throughput impact.