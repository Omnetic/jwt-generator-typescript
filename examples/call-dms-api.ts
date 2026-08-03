/**
 * Sign a Service Account token and call a DMS API endpoint with it.
 *
 * Usage:
 *   npx tsx examples/call-dms-api.ts <path-to-private-key.pem> <kid> <url>
 *
 * The arguments may also come from the OMNETIC_SA_KEY_PATH, OMNETIC_SA_KID and
 * OMNETIC_DMS_API_URL environment variables. Use the URL of the DMS endpoint
 * your Service Account is allowed to call.
 *
 * Uses the global fetch (Node 18+), so this example needs no HTTP dependency —
 * the SDK itself needs nothing beyond node:crypto.
 */

import { readFile } from 'node:fs/promises';

// Imported by package name, so this file reads and runs the same from a clone
// and from an install under node_modules/@omnetic/jwt-generator/examples/ —
// Node and tsc both resolve the self-reference through the package's own
// `exports` map, which points at the committed dist/.
import { generateToken, InvalidArgumentError } from '@omnetic/jwt-generator';

// A short lifetime is enough for a single request; tokens are cheap to mint.
const LIFETIME = 300;
const TIMEOUT_MS = 30_000;

// Empty arguments fall through to the environment, so an omitted `make
// example-request` variable behaves the same as passing nothing at all.
const keyPath = process.argv[2] || process.env.OMNETIC_SA_KEY_PATH || '';
const kid = process.argv[3] || process.env.OMNETIC_SA_KID || '';
const url = process.argv[4] || process.env.OMNETIC_DMS_API_URL || '';

if (keyPath === '' || kid === '' || url === '') {
  fail('Usage: npx tsx examples/call-dms-api.ts <path-to-private-key.pem> <kid> <url>');
}

let privateKey: string;
try {
  // Read the key from disk, so no key material has to travel through argv.
  privateKey = await readFile(keyPath, 'utf8');
} catch {
  fail(`The private key file ${keyPath} does not exist or is not readable.`);
}

if (!url.startsWith('https://')) {
  process.stderr.write(`Warning: ${url} is not HTTPS — the token would travel in plaintext.\n`);
}

let token: string;
try {
  token = await generateToken(privateKey, kid, LIFETIME);
} catch (error) {
  if (error instanceof InvalidArgumentError) {
    fail(`Could not generate a token: ${error.message}`);
  }

  throw error;
}

let response: Response;
let body: string;
try {
  response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    // Redirects are reported, not followed: a 301 from a mistyped endpoint is
    // worth seeing, and the token stays on the host you addressed. curl behaves
    // the same without CURLOPT_FOLLOWLOCATION.
    redirect: 'manual',
    // Bounds the whole exchange, body included — hence the read inside the try,
    // where a stalled or truncated body still reports as a request failure.
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  body = await response.text();
} catch (error) {
  fail(`The request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`);
}

process.stdout.write(`HTTP ${response.status}\n${body}\n`);

// Set the exit code instead of calling process.exit(), which would discard
// whatever of the body is still queued when stdout is a pipe rather than a
// terminal. Nothing keeps the loop alive here, so the process still exits at
// once. A 401 means the Gateway rejected the token: check that the kid matches
// the key, that the Service Account is enabled, and that the clock is not
// skewed.
process.exitCode = response.ok ? 0 : 1;

/** Report a diagnostic on stderr and exit non-zero, leaving stdout clean. */
function fail(message: string): never {
  process.stderr.write(`${message}\n`);

  process.exit(1);
}
