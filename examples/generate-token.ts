/**
 * Sign a Service Account token and print it.
 *
 * Usage:
 *   npx tsx examples/generate-token.ts <path-to-private-key.pem> <kid> [lifetime]
 *
 * The key path and kid may also come from the OMNETIC_SA_KEY_PATH and
 * OMNETIC_SA_KID environment variables. Both the key and the kid are issued on
 * Service Account creation / key rotation.
 */

import { readFile } from 'node:fs/promises';

// Imported by package name, so this file reads and runs the same from a clone
// and from an install under node_modules/@omnetic/jwt-generator/examples/ —
// Node and tsc both resolve the self-reference through the package's own
// `exports` map, which points at the committed dist/.
import { generateToken, InvalidArgumentError } from '@omnetic/jwt-generator';

const DEFAULT_LIFETIME = 3600;

// Empty arguments fall through to the environment, so an omitted `make example`
// variable behaves the same as passing nothing at all.
const keyPath = process.argv[2] || process.env.OMNETIC_SA_KEY_PATH || '';
const kid = process.argv[3] || process.env.OMNETIC_SA_KID || '';
const lifetimeArgument = process.argv[4] || '';
const lifetime = lifetimeArgument === '' ? DEFAULT_LIFETIME : Number(lifetimeArgument);

if (keyPath === '' || kid === '') {
  fail('Usage: npx tsx examples/generate-token.ts <path-to-private-key.pem> <kid> [lifetime]');
}

let privateKey: string;
try {
  // Read the key from disk, so no key material has to travel through argv.
  privateKey = await readFile(keyPath, 'utf8');
} catch {
  fail(`The private key file ${keyPath} does not exist or is not readable.`);
}

let token: string;
try {
  token = await generateToken(privateKey, kid, lifetime);
} catch (error) {
  if (error instanceof InvalidArgumentError) {
    fail(`Could not generate a token: ${error.message}`);
  }

  throw error;
}

// Send this as `Authorization: Bearer <token>` on every DMS API request.
process.stdout.write(`${token}\n`);

/** Report a diagnostic on stderr and exit non-zero, leaving stdout clean. */
function fail(message: string): never {
  process.stderr.write(`${message}\n`);

  process.exit(1);
}
