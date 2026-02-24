# Feature Flag Admin Page Proposal

## Objective

Create an internal admin experience that allows engineers and operators
to:

-   See all registered feature flags
-   Understand their meaning and ownership
-   View current runtime status
-   Evaluate flags for specific contexts (user/account/environment)
-   Understand real-world effects (including stored procedure routing)

This system reduces flag confusion, improves rollout safety, and
prevents stale or undocumented toggles.

------------------------------------------------------------------------

## Non-Goals

-   Building a full experimentation analytics platform
-   Replacing an existing feature flag provider (if present)

------------------------------------------------------------------------

# Architecture Overview

## Two Sources of Truth

### 1. Flag Registry (In-Repo, Authoritative for Meaning)

Stored in:

    flags/registry.yaml

This file is version-controlled and reviewed via pull requests.

Each flag must include:

-   key
-   type (release \| experiment \| ops \| entitlement)
-   owner
-   description
-   default
-   environments
-   created_at
-   expires_at (required for release/experiment)
-   removal_issue
-   effects (human-readable impact)
-   optional links (runbooks, PRs, documentation)

### CI Guardrails

-   New flags must be registered
-   Expiry required for release/experiment flags
-   Expired flags trigger warnings or failures

------------------------------------------------------------------------

### 2. Runtime State (Authoritative for Current Behavior)

Runtime status comes from: - Environment variables - Database
configuration - Or a feature flag provider

Includes: - Enabled/disabled state - Targeting summary - Last changed
timestamp - Changed by (if available)

------------------------------------------------------------------------

# Unified Flag Service Wrapper

A single server-side module provides:

-   listRegistryFlags()
-   getProviderState(keys)
-   evaluate(flagKey, context)
-   explain(flagKey, context)

Evaluation returns:

    {
      value: boolean | variant,
      reason: string,
      explanation: string[],
      effects: string[]
    }

------------------------------------------------------------------------

# Stored Procedure Versioning Support

Public stored procedures remain stable:

    dbo.usp_CreateOrder

Versioned implementations:

    dbo.usp_CreateOrder_v1
    dbo.usp_CreateOrder_v2

The flag determines routing.

Example effect:

-   Routes `dbo.usp_CreateOrder` → `dbo.usp_CreateOrder_v2`
-   Fallback → `dbo.usp_CreateOrder_v1`
-   Signature:
    `@CustomerId int, @ItemsJson nvarchar(max), @PromoCode nvarchar(50)=NULL`

The `explain()` function can compute and return the active procedure and
signature based on context.

------------------------------------------------------------------------

# Admin API

## GET /admin/flags

Returns: - Registry data - Runtime status - Expiry warnings

## POST /admin/flags/evaluate

Request:

    {
      flagKey: string,
      context: {
        environment: string,
        userId?: string,
        accountId?: string,
        roles?: string[],
        plan?: string
      }
    }

Response:

    {
      value,
      reason,
      explanation[],
      effects[]
    }

Optional: - GET /admin/flags/audit

------------------------------------------------------------------------

# Admin UI

## Main Table

Columns:

-   Flag Key
-   Enabled (indicator)
-   Type
-   Owner
-   Description
-   Expiry
-   Last Changed
-   Actions (Details / Evaluate)

## Detail View

-   Full description
-   Effects (declared + computed)
-   Targeting summary
-   Evaluate form
-   Result explanation

------------------------------------------------------------------------

# Security

-   Admin-only access
-   Evaluation endpoint access logged
-   Future write actions require audit logging

------------------------------------------------------------------------

# Observability

-   Evaluation counts by flag
-   Rollout visibility (proc version routing during rollout)
-   Provider health indicator

------------------------------------------------------------------------

# Rollout Plan

## Phase 1 -- MVP (Read-Only)

-   Registry + CI enforcement
-   Flag Service wrapper
-   Admin API (list + evaluate)
-   Admin UI table + detail drawer
-   Stored procedure routing explanations for critical flags

## Phase 2 -- Lifecycle Management

-   Expiry dashboard
-   Removal tracking
-   Expiring-soon warnings

## Phase 3 -- Optional Write Controls

-   UI-based enable/disable
-   Full audit logging

------------------------------------------------------------------------

# Acceptance Criteria

-   All flags listed with descriptions and ownership
-   Runtime state visible
-   Context-based evaluation works
-   Stored procedure routing effects visible
-   CI prevents undocumented flags

------------------------------------------------------------------------

# Summary

This proposal establishes:

-   A documented, version-controlled feature flag registry
-   A standardized evaluation layer
-   A transparent admin experience
-   Safe stored procedure version rollouts
-   Clear lifecycle enforcement

The result is predictable, observable, and maintainable feature
management across application and database layers.
