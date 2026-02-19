# P1: Graceful Shutdown — Socket Draining Fix

## Issue

Socket draining logic in graceful shutdown attempts `socket.setHeader()` on raw TCP sockets, but this method does not exist on raw socket objects—only on HTTP response objects. The optional chaining operator (`?.`) silently makes this a no-op, rendering the socket drain step ineffective.

```javascript
// Current code (ineffective):
for (const socket of activeConnections) {
  socket.setHeader?.('Connection', 'close'); // ← No-op on raw sockets
}
```

## Root Cause

- `activeConnections` tracks raw TCP sockets from the `'connection'` event
- Raw sockets do not have a `setHeader()` method
- `setHeader()` is only available on `http.ServerResponse` objects
- The optional chaining silently prevents errors but also prevents the intended behavior

## Solution

When SIGTERM/SIGINT is received, the app emits a `'shutdown'` event. The built-in shutdown rejection middleware listens to this event and sets an internal flag to reject new requests with 503 status:

```javascript
// In app-factory.js
let isShuttingDown = false;
app.on('shutdown', () => {
  isShuttingDown = true;
});

app.use((req, res, next) => {
  if (isShuttingDown) {
    res.status(503).set('Connection', 'close').json({
      error: 'Server is shutting down',
      message: 'Please retry your request',
    });
    return;
  }
  next();
});
```

**Graceful shutdown flow:**

1. ✅ `app.emit('shutdown')` signals shutdown mode to all listeners
2. ✅ Shutdown rejection middleware sets internal flag
3. ✅ New requests (including on keep-alive connections) get 503 + `Connection: close`
4. ✅ Requests already in the middleware pipeline (past the shutdown check) complete normally
5. ✅ `server.close()` stops accepting new TCP connections
6. ✅ server.close() waits for in-flight requests to complete
7. ✅ Timeout handler forcefully destroys remaining sockets if needed

**Important behavioral note:**

Requests are considered "in-flight" if they have already passed the shutdown check middleware when SIGTERM is received. Requests that arrive after shutdown begins (even on existing keep-alive connections) are immediately rejected with 503. This is correct Kubernetes behavior - once the pod receives SIGTERM, it should not accept new work.

**For plugins/custom code:**

```javascript
app.on('shutdown', async () => {
  // Cleanup database connections, flush caches, etc.
  await db.close();
  console.warn('Database closed gracefully');
});
```

**Action:** No action needed—this is the designed behavior.

## Files Modified

- [core/shared/src/server-factory.js](core/shared/src/server-factory.js)

## Testing

The graceful shutdown behavior is covered by integration tests in [tests/integration/startup-hook-ordering.test.js](tests/integration/startup-hook-ordering.test.js).

Verify that:

1. Shutdown middleware correctly rejects new requests with 503 status
2. In-flight requests complete before timeout
3. Socket timeout enforcement works after shutdown timeout expires
