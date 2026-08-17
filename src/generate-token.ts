import { createPrivateKey, type KeyObject } from 'node:crypto';

import { SignJWT } from 'jose';

import { InvalidArgumentError } from './errors';

const ALGORITHM = 'RS256';
const TOKEN_TYPE = 'sa';
const MAX_LIFETIME = 3600;
const MIN_KEY_BITS = 2048;

/**
 * Build a signed RS256 JWT for authenticating a Service Account against the DMS API.
 *
 * @param privateKey RSA private key in PEM format (PKCS1 or PKCS8)
 * @param kid Key ID; carried in both the JWT header and the `sub` claim
 * @param lifetime Token validity in seconds (1–3600), default 3600
 * @returns Signed JWT ready for the `Authorization: Bearer` header
 */
export async function generateToken(
  privateKey: string,
  kid: string,
  lifetime: number = MAX_LIFETIME,
): Promise<string> {
  if (kid === '') {
    throw new InvalidArgumentError('The kid must not be empty.');
  }

  if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > MAX_LIFETIME) {
    throw new InvalidArgumentError(
      `The lifetime must be an integer between 1 and ${MAX_LIFETIME} seconds, got ${lifetime}.`,
    );
  }

  const key = parseRsaPrivateKey(privateKey);

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    type: TOKEN_TYPE,
    sub: kid,
    iat: issuedAt,
    exp: issuedAt + lifetime,
  };

  return new SignJWT(payload).setProtectedHeader({ alg: ALGORITHM, typ: 'JWT', kid }).sign(key);
}

function parseRsaPrivateKey(privateKey: string): KeyObject {
  if (privateKey === '') {
    throw new InvalidArgumentError('The private key must not be empty.');
  }

  let key: KeyObject;
  try {
    key = createPrivateKey(privateKey);
  } catch {
    throw new InvalidArgumentError('The private key is not a valid PEM-encoded key.');
  }

  if (key.asymmetricKeyType !== 'rsa') {
    throw new InvalidArgumentError('The private key must be an RSA key.');
  }

  const modulusLength = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (modulusLength < MIN_KEY_BITS) {
    throw new InvalidArgumentError(`The RSA private key must be at least ${MIN_KEY_BITS} bits.`);
  }

  return key;
}
