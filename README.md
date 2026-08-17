# jwt-generator-typescript

TypeScript SDK for generating signed **RS256** JWT tokens used to authenticate Omnetic DMS
**Service Account (SA)** requests against the DMS API.

## Requirements

- Node.js **18+** (consumers)
- Docker + Docker Compose (for local development)

## Installation

Distributed directly from GitHub — no public package registry (v1). The built `dist/` is
committed, so nothing is compiled on install:

```bash
npm install github:carvago/jwt-generator-typescript
```

## Usage

```ts
import { generateToken } from '@omnetic/jwt-generator';

const token = await generateToken(privateKey, kid, 3600);
// Authorization: Bearer <token>
```

- `privateKey` — RSA private key in PEM format (PKCS1 or PKCS8), issued on SA creation / key
  rotation
- `kid` — key ID (issued alongside the key); becomes the JWT `sub` claim
- `lifetime` — token validity in whole seconds, optional, default `3600`, max `3600`

`generateToken()` builds and RS256-signs a JWT with header
`{"alg":"RS256","typ":"JWT","kid":"<kid>"}` and the claims:

```json
{ "type": "sa", "sub": "<kid>", "iat": "<now>", "exp": "<now + lifetime>" }
```

It rejects (throws `InvalidArgumentError`) if the `kid` is empty, `lifetime` is not an integer in
`1…3600`, or the private key is empty / not a valid RSA PEM / shorter than 2048 bits.

## Examples

Two runnable scripts in [`examples/`](examples) — both take the key path, the `kid` and (for the
request example) the endpoint URL as arguments, or from the `OMNETIC_SA_KEY_PATH`,
`OMNETIC_SA_KID` and `OMNETIC_DMS_API_URL` environment variables. They are TypeScript, so run
them with a TS runner — [`tsx`](https://tsx.is) is what this repo uses:

```bash
# Print a signed token (default lifetime 3600 s; optional third argument overrides it)
npx tsx examples/generate-token.ts ./sa-key.pem <kid> 600

# Call a DMS endpoint with a freshly signed token — prints the status and body
npx tsx examples/call-dms-api.ts ./sa-key.pem <kid> https://<dms-host>/<endpoint>
```

The scripts ship with the package, so they also run straight from an install, no clone needed:

```bash
npx tsx node_modules/@omnetic/jwt-generator/examples/generate-token.ts ./sa-key.pem <kid>
```

Both import the SDK by package name (`@omnetic/jwt-generator`), which Node resolves through the
package's own `exports` map — so the file you read in this repo is the file that runs in your
project, ready to copy as a starting point.

Pass the path to the key, never the key itself, so no key material lands in your shell history.
Both scripts write the token / response to stdout and every diagnostic to stderr, and exit
non-zero on failure (`call-dms-api.ts` exits `0` on any `2xx`), so they compose in scripts and CI.

Use the URL of a DMS endpoint your Service Account is allowed to call; the example does not
assume one. A `401` means the Gateway rejected the token — check that the `kid` matches the key,
that the Service Account is enabled, and that the clock is not skewed. A `301`/`302` is reported
as-is rather than followed, so a mistyped endpoint shows up instead of being chased with the token
attached. `call-dms-api.ts` uses the global `fetch` (Node 18+), so it adds no HTTP dependency.

Via Docker, wrapped by the Makefile (the key must sit inside the repo — that is what gets
mounted; `*.pem` is git-ignored):

```bash
make example         KEY=./sa-key.pem KID=<kid> [LIFETIME=600]
make example-request KEY=./sa-key.pem KID=<kid> URL=https://<dms-host>/<endpoint>
```

The three environment variables are forwarded into the container, so they work as fallbacks for
the `make` targets too.

## Development

Everything runs inside Docker — no local Node required.

```bash
make build       # build the dev/test image (Node 22)
make install     # npm install
make test        # run vitest
make typecheck   # run tsc --noEmit (strict)
make lint        # ESLint + Prettier check
make lint-fix    # auto-fix ESLint + Prettier
make build-dist  # rebuild dist/ (ESM + CJS + .d.ts)
make shell       # open a shell in the container
```

> **Committed `dist/`:** the build output is committed so the package installs from GitHub with
> no build step. After changing anything in `src/`, run `make build-dist` and commit the updated
> `dist/`.
