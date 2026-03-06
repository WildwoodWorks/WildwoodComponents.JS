// Client configuration types

import type { StorageAdapter } from '../platform/types.js';

export interface WildwoodConfig {
  /** Base URL for the WildwoodAPI server (e.g. https://localhost:5291) */
  baseUrl: string;
  /** Optional API key for server-to-server authentication */
  apiKey?: string;
  /** Application identifier */
  appId?: string;
  /** Show detailed error messages (default: true) */
  enableDetailedErrors?: boolean;
  /** HTTP request timeout in seconds (default: 30) */
  requestTimeoutSeconds?: number;
  /** Enable automatic retry on failure (default: true) */
  enableRetry?: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetryAttempts?: number;
  /** Enable response caching (default: true) */
  enableCaching?: boolean;
  /** Cache duration in minutes (default: 10) */
  cacheDurationMinutes?: number;
  /** Session expiration in minutes (default: 60) */
  sessionExpirationMinutes?: number;
  /** Automatically refresh JWT before expiry (default: false) */
  enableAutoTokenRefresh?: boolean;
  /** Extend session on activity (default: true) */
  slidingExpiration?: boolean;
  /** Persist session across browser restarts (default: false) */
  persistentSession?: boolean;
  /** Storage adapter - 'localStorage', 'memory', or custom StorageAdapter (default: 'localStorage') */
  storage?: 'localStorage' | 'memory' | StorageAdapter;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
  timeout?: number;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface ApiError {
  message: string;
  status: number;
  code?: string;
  details?: unknown;
}

export type RequestInterceptor = (url: string, init: RequestInit) => RequestInit | Promise<RequestInit>;
export type ResponseInterceptor = (url: string, response: Response, durationMs: number) => void | Promise<void>;
