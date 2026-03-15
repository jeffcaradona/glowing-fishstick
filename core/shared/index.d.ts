// Type declarations for @glowing-fishstick/shared

import type { Express, RequestHandler, Request } from 'express';
import type { Logger } from 'pino';

// ── Server & Lifecycle ─────────────────────────────────────────────────────────

export interface ServerResult {
  server: import('http').Server;
  close: () => Promise<void>;
  registerStartupHook: (hook: () => Promise<void>) => void;
  registerShutdownHook: (hook: () => Promise<void>) => void;
}

export interface ServerConfig {
  port?: number;
  shutdownTimeout?: number;
  allowProcessExit?: boolean;
  logger?: Logger;
  [key: string]: unknown;
}

export function createServer(app: Express, config: ServerConfig): ServerResult;

export interface HookRegistry {
  register: (hook: () => Promise<void>) => void;
  execute: (logger?: Logger) => Promise<void>;
}

export function createHookRegistry(): HookRegistry;

export function storeRegistries(
  app: Express,
  startupRegistry: HookRegistry,
  shutdownRegistry: HookRegistry,
): void;

export function attachHookRegistries(app: Express): {
  startupRegistry: HookRegistry;
  shutdownRegistry: HookRegistry;
};

export function createShutdownGate(app: Express): RequestHandler;

// ── Logging (re-exported from @glowing-fishstick/logger) ───────────────────────

export interface LoggerOptions {
  name?: string;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  logDir?: string;
  enableFile?: boolean;
}

export function createLogger(options?: LoggerOptions): Logger;
export function createRequestLogger(logger: Logger): RequestHandler;

// ── Request & Middleware ───────────────────────────────────────────────────────

export function createRequestIdMiddleware(): RequestHandler;

export interface AdminThrottleOptions {
  windowMs: number;
  max: number;
  paths: string[];
}

export function createAdminThrottle(options: AdminThrottleOptions): RequestHandler;

// ── Error Utilities ────────────────────────────────────────────────────────────

export interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
}

export function normalizeError(err: Error & { statusCode?: number; code?: string; isOperational?: boolean }): NormalizedError;

export function resolveErrorLogger(req: Request): (meta: object, msg: string) => void;

export function logUnexpectedError(
  req: Request,
  err: Error,
  logFn: (meta: object, msg: string) => void,
  label?: string,
): void;

// ── Authentication (JWT) ───────────────────────────────────────────────────────

export function generateToken(secret: string, expiresIn?: string): string;
export function verifyToken(token: string, secret: string): object;
export function jwtAuthMiddleware(secret: string): RequestHandler;

// ── Service Container (Dependency Injection) ───────────────────────────────────

export interface ServiceContainerContext {
  resolve: (name: string) => Promise<unknown>;
  has: (name: string) => boolean;
  logger?: Logger;
}

export interface ServiceRegistrationOptions {
  lifecycle?: 'singleton' | 'transient';
  dispose?: (instance: unknown) => void | Promise<void>;
}

export interface ServiceContainer {
  register(name: string, provider: ((ctx: ServiceContainerContext) => unknown | Promise<unknown>) | unknown, opts?: ServiceRegistrationOptions): void;
  registerValue(name: string, value: unknown, opts?: Omit<ServiceRegistrationOptions, 'lifecycle'>): void;
  resolve(name: string): Promise<unknown>;
  has(name: string): boolean;
  keys(): string[];
  dispose(): Promise<void>;
}

export interface ServiceContainerOptions {
  logger?: Logger;
}

export function createServiceContainer(options?: ServiceContainerOptions): ServiceContainer;

export class ServiceAlreadyRegisteredError extends Error {
  constructor(name: string);
}

export class ServiceNotFoundError extends Error {
  constructor(name: string);
}

export class ServiceCircularDependencyError extends Error {
  path: string[];
  constructor(path: string[]);
}

export class ServiceResolutionError extends Error {
  constructor(name: string, cause: Error);
}

export class ServiceDisposeError extends Error {
  constructor(name: string, cause: Error);
}

export class ServiceAggregateDisposeError extends Error {
  errors: Array<{ name: string; cause: Error }>;
  constructor(errors: Array<{ name: string; cause: Error }>);
}

// ── Formatting ─────────────────────────────────────────────────────────────────

export function formatUptime(seconds: number): string;
