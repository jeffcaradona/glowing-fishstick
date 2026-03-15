

## Executive Summary: Agent & Developer Discoverability Failures

### What happened

An AI coding agent (and by extension, any new developer) built two pieces of infrastructure from scratch that the framework already provided:

1. **A vault service** (`initVault` / `getCredentials` / `closeVault`) — the framework already had a dependency injection container (`config.services`) wired into every config object, purpose-built for registering and resolving shared services like this.
2. **Installed `pino-pretty`** as a consumer dependency through trial-and-error — the framework already bundled it, but npm gave no signal it was needed because it was hidden in `devDependencies` instead of `peerDependencies`.

Both mistakes wasted time and introduced unnecessary code. Both were entirely preventable.

### Why it happened

The framework's capabilities were **invisible at every discovery surface**:

| Discovery surface | Gap | Effect |
|---|---|---|
| **README** | `config.services` not mentioned in any package README | Agent/dev doesn't know DI exists |
| **README** | 4 of 22 exports documented in `@glowing-fishstick/shared` | 80% of the API surface is invisible to anyone reading docs |
| **package.json** | `pino-pretty` listed as `devDependencies` instead of `peerDependencies` | npm gives no warning; consumer hits a runtime crash with no explanation |
| **Type declarations** | No `.d.ts` files, no `"types"` field | IDE autocomplete and agent type inference both fall back to `any` — the most powerful discovery tool (hover/autocomplete) is blind |

### The core principle

**If a capability isn't visible at the point of decision, it doesn't exist.** Agents and developers make "build vs. reuse" decisions based on what they can see in three places:

1. **Package README** — the first thing read when evaluating a dependency
2. **IDE autocomplete** — the real-time signal while writing code
3. **npm install warnings** — the signal at dependency resolution time

If your framework's capabilities don't appear in any of these three channels, consumers will reinvent them.

### How to prevent this in future projects

#### At package creation time

- **Document every public export** in the README with a one-line description. A table format scales well.
- **Ship `.d.ts` files** from day one, even for JavaScript projects. This is the single highest-leverage discoverability investment — it powers autocomplete in every editor and gives AI agents type-aware context.
- **Use `peerDependencies`** (with `optional: true` when appropriate) for any runtime dependency the consumer is expected to have. `devDependencies` is invisible to consumers.

#### At feature completion time

- **Ask: "How would a new consumer discover this?"** If the answer requires reading source code, the feature is effectively undocumented.
- **Document DI containers and service registries prominently.** These are the most commonly reinvented patterns because they're infrastructure — invisible unless explicitly surfaced.
- **Include a usage example showing the intended integration point**, not just the API signature. "Use `config.services.register()`" is far more discoverable than "we export `createServiceContainer()`."

#### As a review gate

Add this to your PR/release checklist:

- [ ] Every new export appears in the package README
- [ ] `index.d.ts` updated with typed signatures
- [ ] Runtime-optional dependencies use `peerDependencies`, not `devDependencies`
- [ ] Config properties that enable major features (DI, auth, logging) are documented with examples

### The one-sentence takeaway

> **Ship types, document every export, and put DI containers in the README — not in the source code where only the framework authors will find them.**