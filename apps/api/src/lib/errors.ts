export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function toErrorResponse(error: AppError) {
  return {
    error: { code: error.code, message: error.message, details: error.details },
  };
}
