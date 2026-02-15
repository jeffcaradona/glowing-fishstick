# Application Template — Glowing Fishstick

This is a **minimum viable template** for building an application using the `@glowing-fishstick/app` core module.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

**Development mode** (with auto-restart):
```bash
npm run dev
```

**Production mode**:
```bash
npm run start
```

### 3. Access the Application

Open your browser to: **http://localhost:3000**

Visit your app route: **http://localhost:3000/my-feature**

---

## Template Structure

```
├── package.json           # Dependencies and scripts
├── README.md             # This file
└── src/
    ├── server.js         # Entry point — composes & boots the app
    ├── app.js            # App plugin — registers routes & hooks
    ├── config/
    │   └── env.js        # Configuration overrides
    ├── routes/
    │   └── router.js     # Application routes
    ├── views/
    │   └── my-feature.ejs    # Example view template
    └── public/           # Static assets (CSS, JS, images)
```

---

## How to Customize

### 1. Update Application Name

Edit `src/config/env.js`:
```javascript
export const appOverrides = {
  appName: 'your-app-name',  // Change this
  appVersion: '0.0.1',
  // ... other config
};
```

### 2. Add Routes

Edit `src/routes/router.js` to add your own routes:
```javascript
router.get('/your-path', (_req, res) => {
  res.render('your-page', { appName: config.appName });
});
```

### 3. Create Views

Add `.ejs` templates in `src/views/` and render them from routes.

Layout files are provided by the core module and can be included:
```ejs
<%- include('layouts/header', { appName }) %>
  <!-- Your content -->
<%- include('layouts/footer') %>
```

### 4. Add Startup/Shutdown Hooks

Edit `src/app.js` to register initialization and cleanup tasks:
```javascript
app.registerStartupHook(async () => {
  // Initialize resources (database, cache, etc.)
});

app.registerShutdownHook(async () => {
  // Clean up resources
});
```

### 5. Override More Configuration

Expand `appOverrides` in `src/config/env.js` with additional config options from the core module.

---

## Available Core Routes

The core `@glowing-fishstick/app` module provides:

- **GET /** — Landing page
- **GET /healthz** — Health check endpoint
- **GET /admin** — Admin dashboard
- **GET /admin/config** — Configuration viewer

Your application routes are mounted alongside these.

---

## Environment Variables

Create a `.env` file in the project root to set environment-specific values:

```
NODE_ENV=development
PORT=3000
```

---

## Deployment

When ready for production:

1. Install production dependencies only:
   ```bash
   npm install --production
   ```

2. Start the server:
   ```bash
   npm run start
   ```

3. Set `NODE_ENV=production` for production environment

---

For more details, see the [glowing-fishstick documentation](../documentation/).
