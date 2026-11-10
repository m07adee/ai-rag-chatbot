/** Errors whose message is safe to show to the caller (HTTP 4xx). */
export class UserError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}
