# jwt-generator-typescript

TypeScript SDK that generates signed **RS256** JWT tokens for authenticating Omnetic DMS
**Service Account (SA)** requests against the DMS API. Distributed to third parties as a
standalone library — installed directly from GitHub, no public package registry (v1).

> **Status:** the SA token generator is implemented — `generateToken()` produces an RS256-signed
> JWT (see Public API). The other-language SDKs (C#/Python/PHP) live in separate repos.

## Tech Stack

- **Library floor:** Node.js **18+** (what consumers need).
- **Runtime dependency:** `jose ^5` for RS256 signing. Node's built-in `crypto` module parses and
  validates the RSA private key.
- **Dev/test image:** Node **22** (pinned in the Dockerfile).
- **Testing:** vitest. **Type-checking:** `tsc --noEmit` with `strict` (the PHPStan analog).
- **Examples runner:** `tsx` (dev-only) — `examples/` is TypeScript, like the code consumers write.
- **Code style:** ESLint (typescript-eslint, type-checked) + Prettier (the ECS analog).
- **Build:** tsup → committed dual (ESM + CJS + `.d.ts`) `dist/`.
- **Package manager:** npm. **Local runtime:** Docker + Docker Compose.

## Layout

```
src/index.ts           ← public entry point; re-exports the API
src/generate-token.ts  ← generateToken() + RSA key parsing/validation
src/errors.ts          ← InvalidArgumentError
tests/                 ← vitest suite
examples/              ← runnable CLI usage examples (TypeScript, run with tsx)
dist/                  ← committed build output (ESM + CJS + .d.ts)
Dockerfile             ← node:22-alpine
docker-compose.yml     ← single `node` service, mounts the repo
Makefile               ← dev entry points (wrap `docker compose run --rm node …`)
tsup.config.ts         ← build config
vitest.config.ts       ← test config
eslint.config.js       ← code-style config
```

## Development

Everything runs inside Docker — no local Node required.

```bash
make build       # build the dev/test image
make install     # npm install
make test        # run vitest
make typecheck   # run tsc --noEmit (strict)
make lint        # ESLint + Prettier check
make lint-fix    # auto-fix code style
make build-dist  # rebuild the committed dist/
make shell       # open a shell in the container

# Runnable examples (the key must sit inside the repo — that is what gets mounted)
make example         KEY=./sa-key.pem KID=<kid> [LIFETIME=600]
make example-request KEY=./sa-key.pem KID=<kid> URL=https://<dms-host>/<endpoint>
```

Equivalent without `make`: `docker compose run --rm node <cmd>` (e.g.
`docker compose run --rm node npm test`).

## Public API

```ts
import { generateToken } from '@omnetic/jwt-generator';

// lifetime is optional; defaults to 3600 (and is capped at 3600)
const token = await generateToken(privateKey, kid, 3600);
```

- `privateKey` — RSA private key in **PEM** format, PKCS1 or PKCS8 (issued on SA creation / key
  rotation).
- `kid` — key ID (issued alongside the key); becomes the JWT `sub` claim.
- `lifetime` — token validity in whole seconds, optional, default `3600`, **max `3600`**.
- Returns a `Promise<string>` — the signed JWT for the `Authorization: Bearer` header.

The signed token uses **RS256** with header `{"alg":"RS256","typ":"JWT","kid":"<kid>"}` (the `kid`
is carried in **both** the header and the `sub` claim) and these payload claims:

```json
{ "type": "sa", "sub": "<kid>", "iat": "<now>", "exp": "<now + lifetime>" }
```

Validation the SDK enforces (cheap argument checks first, key parsing last): non-empty `kid`,
integer `1 <= lifetime <= 3600`, non-empty key, valid RSA PEM of at least 2048 bits. Every failure
throws `InvalidArgumentError`.

## Conventions

- Strict TypeScript in every file; no `any` in the public surface.
- Single runtime dependency (`jose`); `crypto` is built in.
- Signing goes through `jose` (RS256); `node:crypto` parses/validates the key.
- Every public behavior gets a vitest test; `make test`, `make typecheck`, and `make lint` must
  stay green.
- After changing `src/`, rebuild and commit `dist/` (`make build-dist`).
- `examples/` is typechecked and linted like the rest of the repo — keep the scripts runnable,
  self-contained (no shared bootstrap, so each reads top to bottom on its own) and free of
  hard-coded DMS hosts. They import the SDK by package name, which resolves through the
  `exports` map to `dist/`, so they run unchanged from a consumer install (`examples/` is in
  `files`); `tests/examples.test.ts` pins their output, exit codes and argument handling.
- Examples must not call `process.exit()` after writing a payload to stdout — set
  `process.exitCode` instead. `process.exit()` discards queued writes when stdout is a pipe, so
  `make example-request … | jq` would silently truncate. Only `fail()`, whose one-line diagnostic
  always fits the pipe buffer, exits directly.

## Context

- Jira: **T20-127460** ("[BE] JWT Generator SDK — C#, Python, TypeScript, PHP").
- Tokens must pass Gateway validation — **UC10 in T20-120653**. The claim shape and RS256
  algorithm above are the contract; do not diverge from them.
- The token-type claim is **`type`** (value `sa`), per the gateway contract (DEV-2012, confirmed
  in MR !13706). The legacy `typ` **payload** claim is deprecated — do **not** emit it.
- Sibling SDKs (separate repos): `omnetic-jwt-generator-csharp`, `omnetic-jwt-generator-python`,
  `omnetic-jwt-generator-php`.
