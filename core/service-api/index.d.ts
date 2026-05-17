// Type declarations for @glowing-fishstick/api

import type { Express } from 'express';
import type { Logger } from 'winston';
import type { ServiceContainer } from '@glowing-fishstick/shared';

export type Plugin = (app: Express, config: ApiConfig) => void;

export interface ApiConfig {
  port: number;
  nodeEnv: string;
  appName: string;
  appVersion: string;
  frameworkVersion: string;
  enableRequestLogging: boolean;
  allowProcessExit: boolean;
  shutdownTimeout: number;
  blockBrowserOrigin: boolean;
  requireJwt: boolean;
  jwtSecret: string;
  jwtExpiresIn: string;
  jsonBodyLimit: string;
  urlencodedBodyLimit: string;
  urlencodedParameterLimit: number;
  adminRateLimitWindowMs: number;
  adminRateLimitMax: number;
  logger?: Logger;
  /** Minimum log level forwarded to auto-constructed logger when `logger` is unset. */
  logLevel?: string;
  /** Dotted paths in log meta to mask with '[REDACTED]'. */
  logRedact?: string[];
  /** Enable JSON file transport on the auto-constructed logger. Defaults to false. */
  enableFileLogging?: boolean;
  /** Directory for log files when `enableFileLogging` is true. */
  logDir?: string;
  /** Dependency injection container — auto-created if not provided. */
  services: ServiceContainer;
  [key: string]: unknown;
}

export interface ApiConfigOverrides {
  port?: number;
  nodeEnv?: string;
  appName?: string;
  appVersion?: string;
  enableRequestLogging?: boolean;
  allowProcessExit?: boolean;
  shutdownTimeout?: number;
  blockBrowserOrigin?: boolean;
  requireJwt?: boolean;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  jsonBodyLimit?: string;
  urlencodedBodyLimit?: string;
  urlencodedParameterLimit?: number;
  adminRateLimitWindowMs?: number;
  adminRateLimitMax?: number;
  logger?: Logger;
  logLevel?: string;
  logRedact?: string[];
  enableFileLogging?: boolean;
  logDir?: string;
  /** Provide your own ServiceContainer, or one is auto-created. */
  services?: ServiceContainer;
  [key: string]: unknown;
}

export function createApiConfig(
  overrides?: ApiConfigOverrides,
  env?: Record<string, string | undefined>,
): Readonly<ApiConfig>;

export function createApi(config: Readonly<ApiConfig>, plugins?: Plugin[]): Express;
