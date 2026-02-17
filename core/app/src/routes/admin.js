/**
 * @module routes/admin
 * @description Admin dashboard and config viewer routes.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Router } from 'express';
import { filterSensitiveKeys } from '../config/env.js';
import { formatUptime } from '@glowing-fishstick/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create a router for admin pages.
 *
 * @param {object} config - Frozen app config.
 * @returns {import('express').Router}
 */
export function adminRoutes(config) {
  const router = Router();
  const logger = config.logger;

  /** Admin dashboard — app info, uptime, memory. */
  router.get('/admin', async (_req, res) => {
    const timeoutMs = config.apiHealthTimeoutMs ?? 3000;
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const apiMemoryUrl = new globalThis.URL('/metrics/memory', config.apiBaseUrl);
    const apiRuntimeUrl = new globalThis.URL('/metrics/runtime', config.apiBaseUrl);

    const [appMemoryResult, appRuntimeResult, apiMemoryResult, apiRuntimeResult] =
      await Promise.allSettled([
        Promise.resolve(process.memoryUsage()),
        Promise.resolve({
          nodeVersion: process.version,
          uptime: formatUptime(process.uptime()),
        }),
        fetch(apiMemoryUrl, {
          method: 'GET',
          signal: controller.signal,
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`API memory endpoint failed with status ${response.status}`);
          }
          const payload = await response.json();
          if (!payload?.memoryUsage) {
            throw new Error('API memory payload missing memoryUsage');
          }
          return payload.memoryUsage;
        }),
        fetch(apiRuntimeUrl, {
          method: 'GET',
          signal: controller.signal,
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`API runtime endpoint failed with status ${response.status}`);
          }
          const payload = await response.json();
          if (!payload?.nodeVersion || typeof payload?.uptimeSeconds !== 'number') {
            throw new Error('API runtime payload missing required fields');
          }
          return {
            nodeVersion: payload.nodeVersion,
            uptime: formatUptime(payload.uptimeSeconds),
          };
        }),
      ]);

    clearTimeout(timeoutId);

    const appMemoryUsage =
      appMemoryResult.status === 'fulfilled'
        ? appMemoryResult.value
        : { rss: 0, heapUsed: 0, heapTotal: 0 };
    const appRuntime =
      appRuntimeResult.status === 'fulfilled'
        ? appRuntimeResult.value
        : { nodeVersion: process.version, uptime: 'Unavailable' };
    const apiMemoryUsage = apiMemoryResult.status === 'fulfilled' ? apiMemoryResult.value : null;
    const apiRuntime = apiRuntimeResult.status === 'fulfilled' ? apiRuntimeResult.value : null;

    if (apiMemoryResult.status === 'rejected') {
      logger?.warn(
        {
          type: 'api.memory.fetch',
          err: apiMemoryResult.reason,
          upstream: apiMemoryUrl.toString(),
        },
        'Failed to fetch API memory usage for admin dashboard',
      );
    }
    if (apiRuntimeResult.status === 'rejected') {
      logger?.warn(
        {
          type: 'api.runtime.fetch',
          err: apiRuntimeResult.reason,
          upstream: apiRuntimeUrl.toString(),
        },
        'Failed to fetch API runtime for admin dashboard',
      );
    }

    res.render('admin/dashboard', {
      appName: config.appName,
      appVersion: config.appVersion,
      appRuntime,
      apiRuntime,
      appMemoryUsage,
      apiMemoryUsage,
      scripts: ['/js/admin/dashboard.js'],
    });
  });

  /** Config viewer — non-sensitive values only. */
  router.get('/admin/config', (_req, res) => {
    const coreViewsDir = path.join(__dirname, '..', 'views');
    const coreViewsDirRelative = path.relative(process.cwd(), coreViewsDir).replaceAll('\\', '/');
    const appViewsDirRelative = config.viewsDir
      ? path.relative(process.cwd(), config.viewsDir).replaceAll('\\', '/')
      : null;

    const corePublicDir = path.join(__dirname, '..', 'public');
    const corePublicDirRelative = path.relative(process.cwd(), corePublicDir).replaceAll('\\', '/');
    const appPublicDirRelative = config.publicDir
      ? path.relative(process.cwd(), config.publicDir).replaceAll('\\', '/')
      : null;

    res.render('admin/config', {
      config: filterSensitiveKeys(config),
      viewsDirs: {
        app: appViewsDirRelative,
        core: coreViewsDirRelative,
      },
      publicDirs: {
        app: appPublicDirRelative,
        core: corePublicDirRelative,
      },
    });
  });

  /** API health passthrough for dashboard AJAX clients. */
  router.get('/admin/api-health', async (_req, res) => {
    const startedAt = Date.now();
    const timeoutMs = config.apiHealthTimeoutMs ?? 3000;
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const apiUrl = new globalThis.URL(config.apiHealthPath ?? '/readyz', config.apiBaseUrl);

      // TODO(auth): add service-to-service JWT Authorization header.
      // TODO(validation): enforce request forwarding allowlists when proxy scope expands.
      const upstreamResponse = await fetch(apiUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      const durationMs = Date.now() - startedAt;
      logger?.info(
        {
          type: 'api.health.passthrough',
          upstream: apiUrl.toString(),
          upstreamStatus: upstreamResponse.status,
          durationMs,
        },
        'Completed API health passthrough check',
      );

      if (upstreamResponse.ok) {
        res.status(200).json({ status: 'healthy' });
        return;
      }

      res.status(503).json({ status: 'unhealthy' });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      logger?.warn(
        {
          type: 'api.health.passthrough',
          err,
          durationMs,
        },
        'API health passthrough failed',
      );
      res.status(502).json({ status: 'unhealthy' });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  return router;
}
