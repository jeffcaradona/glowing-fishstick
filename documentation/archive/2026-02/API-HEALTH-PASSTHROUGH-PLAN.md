# API Health Passthrough Plan

## Problem Statement

The admin dashboard runs in the browser and cannot always call the API service
directly due to network segmentation and deployment boundaries. We need a
server-side passthrough endpoint in the app so dashboard AJAX can check API
health reliably.

## Scope (This Phase)

- Add a single fixed app endpoint: `GET /admin/api-health`
- The app endpoint probes a single fixed API endpoint: `GET /readyz`
- Dashboard button uses the app endpoint and shows simple healthy/unhealthy
  status

## Non-Goals (This Phase)

- No generic proxying
- No JWT signing or JWT verification
- No client-controlled upstream path, method, or headers

## Security Posture (Now)

- Upstream URL is built from app config only
- Method is fixed to `GET`
- Request body and request headers are not forwarded from client
- Timeout and deterministic response mapping prevent unbounded hanging behavior

## Response Contract

- `200 { "status": "healthy" }`
  - Returned when upstream API readiness probe responds with `2xx`
- `503 { "status": "unhealthy" }`
  - Returned when upstream API responds non-`2xx`
- `502 { "status": "unhealthy" }`
  - Returned when timeout, network error, or passthrough internal error occurs

## Config Keys

- `apiBaseUrl` (example: `http://localhost:3001`)
- `apiHealthPath` (default: `/readyz`)
- `apiHealthTimeoutMs` (default: `3000`)

## Future Work

### JWT Service-to-Service Auth

- App signs JWT per passthrough request
- API verifies JWT claims (`iss`, `aud`, `exp`) and signature
- Key rotation and secret management strategy

### Request Forwarding Validation / Allowlists

- If passthrough surface expands, enforce strict route and method allowlists
- Validate and normalize forwarded query parameters
- Block dangerous headers and payload forwarding by default
