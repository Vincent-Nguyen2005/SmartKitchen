export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    /** Extra data for the client (e.g. the new checkout totals with TOTAL_CHANGED). */
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
