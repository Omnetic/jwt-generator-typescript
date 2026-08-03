"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  InvalidArgumentError: () => InvalidArgumentError,
  generateToken: () => generateToken
});
module.exports = __toCommonJS(index_exports);

// src/generate-token.ts
var import_node_crypto = require("crypto");
var import_jose = require("jose");

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
  return new import_jose.SignJWT(payload).setProtectedHeader({ alg: ALGORITHM, typ: "JWT", kid }).sign(key);
}
function parseRsaPrivateKey(privateKey) {
  if (privateKey === "") {
    throw new InvalidArgumentError("The private key must not be empty.");
  }
  let key;
  try {
    key = (0, import_node_crypto.createPrivateKey)(privateKey);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  InvalidArgumentError,
  generateToken
});
