export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
}

export function successResponse<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  };
}

export function errorResponse(message: string, details?: unknown): ApiResponse<never> {
  return {
    success: false,
    error: {
      message,
      ...(details !== undefined && { details }),
    },
  };
}

