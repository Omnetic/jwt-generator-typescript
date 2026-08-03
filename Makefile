DC = docker compose run --rm node

.PHONY: build install test typecheck lint lint-fix build-dist example example-request shell

# Build the dev/test image
build:
	docker compose build

# Install npm dependencies
install:
	$(DC) npm install

# Run the vitest suite
test:
	$(DC) npm test

# Type-check with tsc (strict, no emit)
typecheck:
	$(DC) npm run typecheck

# Check code style (ESLint + Prettier)
lint:
	$(DC) npm run lint

# Auto-fix code style
lint-fix:
	$(DC) npm run lint:fix

# Rebuild the committed dist/ (ESM + CJS + .d.ts)
build-dist:
	$(DC) npm run build

# Print a signed SA token: make example KEY=./sa-key.pem KID=<kid> [LIFETIME=3600]
example:
	$(DC) npx tsx examples/generate-token.ts "$(KEY)" "$(KID)" $(LIFETIME)

# Call a DMS endpoint with a signed SA token: make example-request KEY=./sa-key.pem KID=<kid> URL=<url>
example-request:
	$(DC) npx tsx examples/call-dms-api.ts "$(KEY)" "$(KID)" "$(URL)"

# Open a shell in the container
shell:
	$(DC) sh
