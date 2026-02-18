/**
 * @module controllers/admin
 * @description Controller factory for admin route handlers.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { formatUptime } from '@glowing-fishstick/shared';
import {
  createAbortControllerWithTimeout,
  normalizeRelativePathForDisplay,
  readApiMemoryUsage,
  readApiRuntime,
  readApiVersion,
} from './admin-controller.helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreViewsDir = path.join(__dirname, '..', 'views');
const corePublicDir = path.join(__dirname, '..', 'public');

/**
 * @typedef {object} AdminControllerDeps
 * @property {object} config - Frozen app config.
 * @property {(config: object) => object} filterSensitiveKeys - Config key filter utility.
 * @property {(input: string | URL, init?: object) => Promise<Response>} [fetchImpl] - Fetch implementation.
 * @property {(req: import('express').Request, context: object) => object} [buildApiRequestOptions]
 */

/**
 * Create handlers for admin routes.
 *
 * `buildApiRequestOptions` is a seam for future service-to-service auth
 * (for example JWT header injection) without coupling route handlers.
 *
 * @param {AdminControllerDeps} deps
 * @returns {{
 *   renderDashboard: import('express').RequestHandler,
 *   renderConfig: import('express').RequestHandler,
 *   checkApiHealth: import('express').RequestHandler,
 * }}
 */
export function createAdminController({
  config,
  filterSensitiveKeys,
  fetchImpl = (...args) => globalThis.fetch(...args),
  buildApiRequestOptions = (_req, context) => ({
    method: 'GET',
    signal: context.signal,
  }),
}) {
  const logger = config.logger;

  return {
    async renderDashboard(req, res) {
      const timeoutMs = config.apiHealthTimeoutMs ?? 3000;
      const { controller, timeoutId } = createAbortControllerWithTimeout(timeoutMs);
      const apiVersionUrl = new globalThis.URL('/', config.apiBaseUrl);
      const apiMemoryUrl = new globalThis.URL('/metrics/memory', config.apiBaseUrl);
      const apiRuntimeUrl = new globalThis.URL('/metrics/runtime', config.apiBaseUrl);

      const [
        appMemoryResult,
        appRuntimeResult,
        apiVersionResult,
        apiMemoryResult,
        apiRuntimeResult,
      ] = await Promise.allSettled([
        Promise.resolve(process.memoryUsage()),
        Promise.resolve({
          nodeVersion: process.version,
          uptime: formatUptime(process.uptime()),
        }),
        readApiVersion(
          fetchImpl,
          apiVersionUrl,
          buildApiRequestOptions(req, { signal: controller.signal }),
        ),
        readApiMemoryUsage(
          fetchImpl,
          apiMemoryUrl,
          buildApiRequestOptions(req, { signal: controller.signal }),
        ),
        readApiRuntime(
          fetchImpl,
          apiRuntimeUrl,
          buildApiRequestOptions(req, { signal: controller.signal }),
        ),
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
      const apiVersionData = apiVersionResult.status === 'fulfilled' ? apiVersionResult.value : null;
      const apiVersion = apiVersionData?.version ?? null;
      const apiFrameworkVersion = apiVersionData?.frameworkVersion ?? null;
      const apiMemoryUsage = apiMemoryResult.status === 'fulfilled' ? apiMemoryResult.value : null;
      const apiRuntime = apiRuntimeResult.status === 'fulfilled' ? apiRuntimeResult.value : null;

      if (apiVersionResult.status === 'rejected') {
        logger?.warn(
          {
            type: 'api.version.fetch',
            err: apiVersionResult.reason,
            upstream: apiVersionUrl.toString(),
          },
          'Failed to fetch API version for admin dashboard',
        );
      }
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
        frameworkVersion: config.frameworkVersion,
        appRuntime,
        apiVersion,
        apiFrameworkVersion,
        apiRuntime,
        appMemoryUsage,
        apiMemoryUsage,
        scripts: ['/js/admin/dashboard.js'],
      });
    },

    renderConfig(_req, res) {
      const coreViewsDirRelative = normalizeRelativePathForDisplay(coreViewsDir);
      const appViewsDirRelative = config.viewsDir
        ? normalizeRelativePathForDisplay(config.viewsDir)
        : null;

      const corePublicDirRelative = normalizeRelativePathForDisplay(corePublicDir);
      const appPublicDirRelative = config.publicDir
        ? normalizeRelativePathForDisplay(config.publicDir)
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
    },

    async checkApiHealth(req, res) {
      const startedAt = Date.now();
      const timeoutMs = config.apiHealthTimeoutMs ?? 3000;
      const { controller, timeoutId } = createAbortControllerWithTimeout(timeoutMs);

      try {
        const apiUrl = new globalThis.URL(config.apiHealthPath ?? '/readyz', config.apiBaseUrl);
        const upstreamResponse = await fetchImpl(
          apiUrl,
          buildApiRequestOptions(req, { signal: controller.signal }),
        );

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
    },
  };
}
