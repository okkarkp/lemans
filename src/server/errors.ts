/** An error that is safe to show to the caller, with the HTTP status it maps to. */
export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AppError";
  }
}
export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorised = () => new AppError(401, "UNAUTHENTICATED", "Please sign in.");
export const forbidden = () => new AppError(403, "FORBIDDEN", "You do not have access to this action.");
export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const rejected = (code: string, message: string) => new AppError(422, code, message);
