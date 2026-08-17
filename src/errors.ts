/**
 * Thrown when an argument to the public API is invalid.
 *
 * Mirrors the PHP reference's single `InvalidArgumentException` type so callers
 * can catch one error class for every validation failure.
 */
export class InvalidArgumentError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}
