/**
 * Standard API-CONV Response Envelopes
 */

export interface ApiResponse<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: unknown;
  };
}

export type DbId = string | number;

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}
