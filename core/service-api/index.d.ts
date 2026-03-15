// Type declarations for @glowing-fishstick/api

import type { Express } from 'express';
import type { Logger } from 'pino';
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
  /** Provide your own ServiceContainer, or one is auto-created. */
  services?: ServiceContainer;
  [key: string]: unknown;
}

export function createApiConfig(overrides?: ApiConfigOverrides, env?: Record<string, string | undefined>): Readonly<ApiConfig>;

export function createApi(config: Readonly<ApiConfig>, plugins?: Plugin[]): Express;
