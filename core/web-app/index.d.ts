// Type declarations for @glowing-fishstick/app

import type { Express, RequestHandler } from 'express';
import type { Logger } from 'pino';
import type {
  ServiceContainer,
  ServerResult,
  HookRegistry,
  LoggerOptions,
} from '@glowing-fishstick/shared';

export type Plugin = (app: Express, config: AppConfig) => void;

export interface AppConfig {
  port: number;
  nodeEnv: string;
  appName: string;
  appVersion: string;
  frameworkVersion: string;
  apiBaseUrl: string;
  apiHealthPath: string;
  apiHealthTimeoutMs: number;
  jsonBodyLimit: string;
  urlencodedBodyLimit: string;
  urlencodedParameterLimit: number;
  adminRateLimitWindowMs: number;
  adminRateLimitMax: number;
  logger?: Logger;
  /** Dependency injection container — auto-created if not provided. */
  services: ServiceContainer;
  [key: string]: unknown;
}

export interface AppConfigOverrides {
  port?: number;
  nodeEnv?: string;
  appName?: string;
  appVersion?: string;
  apiBaseUrl?: string;
  apiHealthPath?: string;
  apiHealthTimeoutMs?: number;
  jsonBodyLimit?: string;
  urlencodedBodyLimit?: string;
  urlencodedParameterLimit?: number;
  adminRateLimitWindowMs?: number;
  adminRateLimitMax?: number;
  logger?: Logger;
  /** Provide your own ServiceContainer, or one is auto-created. */
  services?: ServiceContainer;
  [key: string]: unknown;
}

export function createConfig(overrides?: AppConfigOverrides, env?: Record<string, string | undefined>): Readonly<AppConfig>;
export function filterSensitiveKeys(config: object): Record<string, unknown>;

export function createApp(config: Readonly<AppConfig>, plugins?: Plugin[]): Express;

// Re-exports from @glowing-fishstick/shared
export {
  createServer,
  createLogger,
  createRequestLogger,
  createRequestIdMiddleware,
} from '@glowing-fishstick/shared';

export interface AppError extends Error {
  code: string;
  statusCode: number;
  isOperational: boolean;
}

export function createAppError(code: string, message: string, statusCode: number): AppError;
export function createNotFoundError(message?: string): AppError;
export function createValidationError(message?: string): AppError;
