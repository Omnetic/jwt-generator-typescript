// src/generate-token.ts
import { createPrivateKey } from "crypto";
import { SignJWT } from "jose";

// src/errors.ts
var InvalidArgumentError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidArgumentError";
  }
};

// src/generate-token.ts
var ALGORITHM = "RS256";
var TOKEN_TYPE = "sa";
var MAX_LIFETIME = 3600;
var MIN_KEY_BITS = 2048;
async function generateToken(privateKey, kid, lifetime = MAX_LIFETIME) {
  if (kid === "") {
    throw new InvalidArgumentError("The kid must not be empty.");
  }
  if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > MAX_LIFETIME) {
    throw new InvalidArgumentError(
      `The lifetime must be an integer between 1 and ${MAX_LIFETIME} seconds, got ${lifetime}.`
    );
  }
  const key = parseRsaPrivateKey(privateKey);
  const issuedAt = Math.floor(Date.now() / 1e3);
  const payload = {
    type: TOKEN_TYPE,
    sub: kid,
    iat: issuedAt,
    exp: issuedAt + lifetime
  };
  return new SignJWT(payload).setProtectedHeader({ alg: ALGORITHM, typ: "JWT", kid }).sign(key);
}
function parseRsaPrivateKey(privateKey) {
  if (privateKey === "") {
    throw new InvalidArgumentError("The private key must not be empty.");
  }
  let key;
  try {
    key = createPrivateKey(privateKey);
  } catch {
    throw new InvalidArgumentError("The private key is not a valid PEM-encoded key.");
  }
  if (key.asymmetricKeyType !== "rsa") {
    throw new InvalidArgumentError("The private key must be an RSA key.");
  }
  const modulusLength = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (modulusLength < MIN_KEY_BITS) {
    throw new InvalidArgumentError(`The RSA private key must be at least ${MIN_KEY_BITS} bits.`);
  }
  return key;
}
export {
  InvalidArgumentError,
  generateToken
};
