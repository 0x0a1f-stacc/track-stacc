import type { ErrorResponse, WsErrorAcknowledgement } from "@trackstacc/types";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
    public readonly retryable = false,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

export function toErrorResponse(
  error: AppError,
  requestId: string,
): ErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      retryable: error.retryable,
      retryAfterSeconds: error.retryAfterSeconds,
      details: error.details,
    },
  };
}

export function toWsErrorAcknowledgement(
  error: AppError,
  sourceEvent: string,
  requestId: string,
): WsErrorAcknowledgement {
  return {
    ok: false,
    sourceEvent,
    code: error.code,
    message: error.message,
    requestId,
    retryable: error.retryable,
    retryAfterSeconds: error.retryAfterSeconds,
    details: error.details,
  };
}
