# Idempotent Composable Workflows with Async Completion (SSE Pattern)

## Overview

This document describes a lightweight, code-first workflow architecture
designed for:

-   Idempotent reusable steps
-   Composable multi-step workflows
-   Immediate HTTP response
-   Asynchronous completion notifications via Server-Sent Events (SSE)
-   Durable execution with retry safety

This pattern is especially useful when integrating message queues,
background workers, or long-running processes.

------------------------------------------------------------------------

## High-Level Flow

### 1. User Submits a Form

Client sends:

POST /submit

Server:

1.  Validates input
2.  Creates a `workflowId`
3.  Persists workflow state (`status = running`)
4.  Starts workflow asynchronously
5.  Immediately returns:

``` json
{
  "workflowId": "wf_123",
  "status": "accepted"
}
```

The HTTP request completes immediately.

------------------------------------------------------------------------

### 2. Workflow Runs in Background

Example steps:

-   validateInput
-   createRecord
-   publishToMQ
-   waitForMQResponse
-   finalize

Each step:

-   Is idempotent
-   Persists its result
-   Can be retried safely
-   Emits internal lifecycle events

------------------------------------------------------------------------

### 3. Workflow Completion via SSE

When the workflow completes:

``` js
eventBus.emit('workflow.completed', { workflowId })
```

SSE pushes to client:

event: workflow.completed\
data: { workflowId: "wf_123" }

The UI updates reactively.

------------------------------------------------------------------------

## Core Architectural Principle

Instead of thinking:

> "Handle this request"

Think:

> "Start a durable state machine representing a business process"

The HTTP layer becomes a trigger.\
The workflow runner becomes the state machine.\
SSE becomes the notification channel.

------------------------------------------------------------------------

## Idempotent Step Model

Each step invocation is uniquely identified by:

-   workflowId
-   stepName
-   stepKey (or idempotencyKey)

Rules:

-   If a step already succeeded, return cached output.
-   If it failed, allow retry.
-   Side effects must be protected using unique keys or deduplication.

This guarantees safe retries in crash or MQ redelivery scenarios.

------------------------------------------------------------------------

## Minimal Workflow Runner Example

### HTTP Handler

``` js
app.post('/submit', async (req, res) => {
  const workflowId = await workflows.run('formSubmission', req.body);
  res.json({ workflowId });
});
```

### Workflow Definition

``` js
runner.defineWorkflow('formSubmission', [
  { step: 'validate' },
  { step: 'persist' },
  { step: 'publishToMQ' },
  { step: 'awaitResponse' },
  { step: 'finalize' }
]);
```

------------------------------------------------------------------------

## Why This Pattern Works

✔ Fast user experience\
✔ Retry-safe execution\
✔ Crash recovery capable\
✔ Works naturally with MQ systems\
✔ Evolves into distributed workers easily

------------------------------------------------------------------------

## Optional Enhancements

Future improvements may include:

-   Durable SQL-backed StepStore
-   In-flight deduplication
-   Step-level lifecycle events
-   Workflow dashboard UI
-   Parallel step execution
-   Retry policies with backoff

------------------------------------------------------------------------

## Summary

This architecture provides:

-   A lightweight durable workflow runner
-   Idempotent, composable step functions
-   Async completion notification via SSE
-   Clean separation between HTTP, business logic, and async
    orchestration

It delivers many of the benefits of systems like Temporal or Durable
Functions without introducing heavyweight infrastructure.
