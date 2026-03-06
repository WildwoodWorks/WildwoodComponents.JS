// Typed error class for all Wildwood API errors
// Extends Error so instanceof checks work and stack traces are preserved

export type WildwoodErrorCode =
  | 'InvalidCredentials'
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'ValidationError'
  | 'TwoFactorRequired'
  | 'SessionExpired'
  | 'RateLimited'
  | 'ServerError'
  | 'NetworkError'
  | 'Timeout'
  | 'Unknown';

export class WildwoodError extends Error {
  readonly status: number;
  readonly code: WildwoodErrorCode;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: WildwoodErrorCode, details?: unknown) {
    super(message);
    this.name = 'WildwoodError';
    this.status = status;
    this.code = code ?? WildwoodError.codeFromStatus(status);
    this.details = details;
  }

  private static codeFromStatus(status: number): WildwoodErrorCode {
    if (status === 401) return 'Unauthorized';
    if (status === 403) return 'Forbidden';
    if (status === 404) return 'NotFound';
    if (status === 422) return 'ValidationError';
    if (status === 429) return 'RateLimited';
    if (status >= 500) return 'ServerError';
    if (status === 0) return 'NetworkError';
    return 'Unknown';
  }

  /** Create from an API error response body */
  static fromResponse(status: number, body: unknown, fallbackMessage: string): WildwoodError {
    let message = fallbackMessage;
    let code: WildwoodErrorCode | undefined;

    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if (typeof obj.message === 'string') message = obj.message;
      else if (typeof obj.error === 'string') message = obj.error;
      else if (typeof obj.title === 'string') message = obj.title;

      if (typeof obj.error === 'string') {
        code = WildwoodError.mapApiCode(obj.error);
      }

      if (obj.requiresTwoFactor === true) {
        code = 'TwoFactorRequired';
      }
    }

    return new WildwoodError(message, status, code, body);
  }

  private static mapApiCode(apiError: string): WildwoodErrorCode | undefined {
    const map: Record<string, WildwoodErrorCode> = {
      InvalidCredentials: 'InvalidCredentials',
      Unauthorized: 'Unauthorized',
      Forbidden: 'Forbidden',
      NotFound: 'NotFound',
      ValidationError: 'ValidationError',
      RateLimited: 'RateLimited',
    };
    return map[apiError];
  }
}
