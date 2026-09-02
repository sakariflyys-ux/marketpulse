/** Thrown by services; route handlers map `status`/`code` onto the API envelope. */
export class ServiceError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code: "INVALID" | "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
