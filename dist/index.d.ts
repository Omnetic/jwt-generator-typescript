/**
 * Build a signed RS256 JWT for authenticating a Service Account against the DMS API.
 *
 * @param privateKey RSA private key in PEM format (PKCS1 or PKCS8)
 * @param kid Key ID; carried in both the JWT header and the `sub` claim
 * @param lifetime Token validity in seconds (1–3600), default 3600
 * @returns Signed JWT ready for the `Authorization: Bearer` header
 */
declare function generateToken(privateKey: string, kid: string, lifetime?: number): Promise<string>;

/**
 * Thrown when an argument to the public API is invalid.
 *
 * Mirrors the PHP reference's single `InvalidArgumentException` type so callers
 * can catch one error class for every validation failure.
 */
declare class InvalidArgumentError extends Error {
    constructor(message: string);
}

export { InvalidArgumentError, generateToken };
