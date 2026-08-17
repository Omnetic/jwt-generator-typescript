import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Smoke tests for the examples/ scripts — they ship with the SDK, so their
 * argument handling, output and exit codes are behavior worth pinning down.
 * Each case spawns the real script through tsx, so it exercises the dist/ the
 * examples import by package name — the committed one, as last built, which
 * CI's `npm run build && git diff --exit-code dist` job keeps in sync with src/.
 *
 * call-dms-api.ts is driven against a throwaway loopback server rather than a
 * stubbed fetch, because the behavior worth testing is what the script does
 * with real HTTP outcomes: status codes, large bodies, redirects, and a
 * connection that dies mid-body.
 */

const KID = 'kid-uuid-1';
const RUN_TIMEOUT_MS = 30_000;

// Larger than a pipe buffer, so a body that is written and then abandoned on
// exit shows up here as a short read.
const BIG_BODY = 'x'.repeat(2_000_000);

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
// Dev and CI both run in the Linux container (see docker-compose.yml), so the
// POSIX bin shim is the only one that needs resolving.
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const GENERATE_TOKEN = join(REPO_ROOT, 'examples', 'generate-token.ts');
const CALL_DMS_API = join(REPO_ROOT, 'examples', 'call-dms-api.ts');

// Blanked for every run so an OMNETIC_* variable exported in the developer's
// shell cannot feed the scripts a key path, kid or URL the test did not set.
const BLANK_SA_ENVIRONMENT = {
  OMNETIC_SA_KEY_PATH: '',
  OMNETIC_SA_KID: '',
  OMNETIC_DMS_API_URL: '',
};

interface ExampleResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface ReceivedRequest {
  path: string;
  authorization: string;
  accept: string;
}

let temporaryDirectory: string;
let keyPath: string;
let server: Server;
let baseUrl: string;
const received: ReceivedRequest[] = [];

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'sa-key-'));
  keyPath = join(temporaryDirectory, 'sa-key.pem');

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());

  server = createServer((request, response) => {
    received.push({
      path: request.url ?? '',
      authorization: request.headers.authorization ?? '',
      accept: request.headers.accept ?? '',
    });

    switch (request.url) {
      case '/big':
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end(BIG_BODY);

        return;
      case '/forbidden':
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end('{"error":"unauthorized"}');

        return;
      case '/redirect':
        response.writeHead(302, { location: '/vehicles' });
        response.end();

        return;
      case '/cut':
        // Headers and a partial body, then the connection dies — the failure
        // mode that only shows up while reading the body.
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': '5000' });
        response.write('{"partial":');
        setTimeout(() => response.socket?.destroy(), 50);

        return;
      default:
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"vehicles":[]}');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);

        return;
      }

      resolve();
    });
  });
  await rm(temporaryDirectory, { recursive: true, force: true });
});

/**
 * Runs an example as a child process with stdout piped — the shape
 * `make example | …` and CI give it, and the one where a dropped write shows.
 */
function runExample(
  script: string,
  args: string[],
  environment: Record<string, string> = {},
): Promise<ExampleResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [script, ...args], {
      env: { ...process.env, ...BLANK_SA_ENVIRONMENT, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === null) {
        // Never expected: a crash or an OOM kill must not read as `exit 1`.
        reject(new Error(`${basename(script)} was killed by ${signal ?? 'an unknown signal'}.`));

        return;
      }

      resolve({ status: code, stdout, stderr });
    });
  });
}

describe('examples/generate-token.ts', () => {
  it(
    'prints a signed token on stdout',
    async () => {
      const result = await runExample(GENERATE_TOKEN, [keyPath, KID, '600']);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim().split('.')).toHaveLength(3);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'falls back to the environment when arguments are empty',
    async () => {
      // `make example` always passes both arguments, empty ones included.
      const result = await runExample(GENERATE_TOKEN, ['', ''], {
        OMNETIC_SA_KEY_PATH: keyPath,
        OMNETIC_SA_KID: KID,
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim().split('.')).toHaveLength(3);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'prints usage without arguments',
    async () => {
      const result = await runExample(GENERATE_TOKEN, []);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Usage: npx tsx examples/generate-token.ts');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'reports a key path that is not a readable file',
    async () => {
      const result = await runExample(GENERATE_TOKEN, [temporaryDirectory, KID]);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('does not exist or is not readable');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'reports the SDK validation message',
    async () => {
      const result = await runExample(GENERATE_TOKEN, [keyPath, KID, '9999']);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('The lifetime must be an integer between 1 and 3600 seconds');
    },
    RUN_TIMEOUT_MS,
  );
});

describe('examples/call-dms-api.ts', () => {
  it(
    'prints usage without arguments',
    async () => {
      const result = await runExample(CALL_DMS_API, []);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Usage: npx tsx examples/call-dms-api.ts');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'requires a URL even when the key and kid are given',
    async () => {
      const result = await runExample(CALL_DMS_API, [keyPath, KID]);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Usage: npx tsx examples/call-dms-api.ts');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'sends a bearer token, prints the status and body, and exits zero on 2xx',
    async () => {
      received.length = 0;

      const result = await runExample(CALL_DMS_API, [keyPath, KID, `${baseUrl}/vehicles`]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('HTTP 200\n{"vehicles":[]}\n');
      expect(received).toHaveLength(1);

      const [request] = received;
      expect(request.path).toBe('/vehicles');
      expect(request.accept).toBe('application/json');
      expect(request.authorization.startsWith('Bearer ')).toBe(true);
      expect(request.authorization.slice('Bearer '.length).split('.')).toHaveLength(3);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'still prints the status and body but exits non-zero on 401',
    async () => {
      const result = await runExample(CALL_DMS_API, [keyPath, KID, `${baseUrl}/forbidden`]);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('HTTP 401\n{"error":"unauthorized"}\n');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'writes the whole body when stdout is a pipe',
    async () => {
      const result = await runExample(CALL_DMS_API, [keyPath, KID, `${baseUrl}/big`]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe(`HTTP 200\n${BIG_BODY}\n`);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'reports a redirect instead of following it',
    async () => {
      received.length = 0;

      const result = await runExample(CALL_DMS_API, [keyPath, KID, `${baseUrl}/redirect`]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('HTTP 302');
      // One request only: the Location hop is reported, never chased.
      expect(received.map((request) => request.path)).toEqual(['/redirect']);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'reports a body that dies mid-read as a request failure, without a stack trace',
    async () => {
      const result = await runExample(CALL_DMS_API, [keyPath, KID, `${baseUrl}/cut`]);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(`The request to ${baseUrl}/cut failed:`);
      expect(result.stderr).not.toContain('undici');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'reports an unreachable host as a request failure',
    async () => {
      // Port 9 (discard) refuses connections on the loopback interface.
      const result = await runExample(CALL_DMS_API, [keyPath, KID, 'https://127.0.0.1:9/vehicles']);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('The request to https://127.0.0.1:9/vehicles failed:');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'warns that a plain-HTTP URL exposes the token',
    async () => {
      const result = await runExample(CALL_DMS_API, [keyPath, KID, `${baseUrl}/vehicles`]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain('is not HTTPS — the token would travel in plaintext');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'reports an unreadable key before warning about the scheme',
    async () => {
      const result = await runExample(CALL_DMS_API, [
        temporaryDirectory,
        KID,
        `${baseUrl}/vehicles`,
      ]);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('does not exist or is not readable');
      expect(result.stderr).not.toContain('is not HTTPS');
    },
    RUN_TIMEOUT_MS,
  );

  it(
    'falls back to the environment when arguments are empty',
    async () => {
      // `make example-request` always passes all three arguments, empty ones
      // included.
      const result = await runExample(CALL_DMS_API, ['', '', ''], {
        OMNETIC_SA_KEY_PATH: keyPath,
        OMNETIC_SA_KID: KID,
        OMNETIC_DMS_API_URL: `${baseUrl}/from-env`,
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('HTTP 200\n{"vehicles":[]}\n');
    },
    RUN_TIMEOUT_MS,
  );
});
