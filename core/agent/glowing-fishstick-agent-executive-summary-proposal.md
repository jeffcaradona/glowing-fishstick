# Executive Summary Proposal: `@glowing-fishstick/agent` [DRAFT]

## Proposal in Brief

This proposal recommends adding `@glowing-fishstick/agent` as a new sibling module within the `glowing-fishstick` monorepo, alongside `@glowing-fishstick/api` (`core/service-api`) and `@glowing-fishstick/app` (`core/web-app`), rather than replacing either one. The repository already uses a modular structure across the root package, `web-app`, `service-api`, `generator`, `shared`, and `logger`, making an agent-facing package a natural extension of the current design.[^repo]

`@glowing-fishstick/agent` would serve as a model-facing orchestration layer that sits in front of the API in the same way the web front end can sit in front of the API for user-facing HTTPS concerns. Its job would be to let models interact with the platform through typed tools, validated schemas, and bounded workflows instead of raw routes and ad hoc payloads.

## Why This Module Matters

As AI-assisted and agent-driven use cases grow, the platform benefits from having a dedicated semantic boundary between models and backend services. Rather than exposing raw HTTP endpoints directly to model logic, the agent layer would expose curated operations such as `getTask`, `createSnapshot`, or `queryMetrics`, each backed by Zod validation and implemented through approved calls into `service-api`.

This matches the strengths of the AI SDK stack built around `ai`, `@ai-sdk/openai`, and Zod. The AI SDK supports schema-based structured output generation and tool calling with typed input schemas, which makes it well suited for a controlled, auditable, and developer-friendly agent layer.[^output][^tools]

## Recommended Shape

The proposed module should be **headless and orchestration-focused**.

```text
core/
  agent/
    src/
      config/
      runtime/
      providers/openai/
      clients/service-api/
      tools/
      workflows/
      errors/
    index.js
sandbox/
  agent/
```

### Intended responsibilities

- `service-api` remains the canonical HTTP, auth, and security boundary
- `web-app` remains the user-facing application boundary
- `agent` becomes the model-facing orchestration boundary

### v1 capabilities

- register typed tools backed by `service-api`
- define bounded workflows for common AI tasks
- validate input and output with shared Zod schemas
- support structured object generation for predictable results
- support streaming where useful
- log tool calls, retries, and failures consistently

The right first release is **workflow-first, not autonomy-first**. The AI SDK can support more open-ended agent behavior, but the safer and more maintainable first step is a constrained tool-and-workflow layer with predictable outputs.[^output][^tools]

## Scope and Delivery Impact

This proposal adds meaningful capability without forcing a rewrite of the current platform, but it does introduce a new class of complexity: model behavior, prompt orchestration, tool contracts, and evaluation.

### Estimated scope impact

**Low-creep MVP:** about **25-40%** incremental scope

Assumptions:

- one new first-class package: `@glowing-fishstick/agent`
- one sandbox module for development and examples
- OpenAI integration via `@ai-sdk/openai`
- Zod-backed tool and workflow contracts
- a thin client over `service-api`
- no memory, retrieval, or multi-agent orchestration in v1
- no generator support in the first release

**Medium-creep phase:** about **40-70%** incremental scope

Typical additions that push the effort upward:

- shared contracts used by both the API and agent layers
- generator support for scaffolding agent modules
- agent-specific routes or streaming support in `service-api`
- model evals and regression testing
- richer tracing and observability

**High-creep scenario:** **100%+** incremental scope

That becomes likely if the effort expands into a broader AI platform including:

- durable conversation state
- retrieval and vector search
- human approval workflows
- multi-agent routing
- agent-specific UI work in `web-app`
- multi-provider abstraction beyond the initial target stack

## Recommendation

Approve `@glowing-fishstick/agent` as a **new sibling module** with a narrow, explicit charter:

> provide a clean, typed, and auditable way for models to use the existing API through validated tools and structured workflows.

This framing keeps the proposal aligned with the monorepo’s existing modular architecture and with the AI SDK’s strongest capabilities. It also gives the team a practical path to introduce AI functionality without turning the first release into a full agent platform.[^repo][^output][^tools]

## Bottom Line

`@glowing-fishstick/agent` is a sensible next module for `glowing-fishstick` if it is treated as a focused model-facing facade rather than a replacement for existing services. With disciplined boundaries, the proposal offers strong strategic value and moderate, manageable scope growth.

---

## Sources

[^repo]: `glowing-fishstick` README describing the current modular structure and package boundaries: <https://github.com/jeffcaradona/glowing-fishstick/blob/main/README.md>
[^output]: AI SDK Core documentation for schema-validated structured output generation using `Output.object()`: <https://ai-sdk.dev/docs/reference/ai-sdk-core/output>
[^tools]: Vercel AI SDK documentation describing tool calling and structured data patterns with schemas: <https://vercel.com/docs/ai-sdk>
