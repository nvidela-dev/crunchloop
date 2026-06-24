# Crunchloop — three-service stack (frontend + api + external-api).
# Run `make` or `make help` to see available targets.

SHELL := /bin/bash

# Prefer the v2 docker compose plugin; fall back to legacy docker-compose.
COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# --- Whole stack -----------------------------------------------------------

.PHONY: up
up: ## Build and start all three services + Postgres
	$(COMPOSE) up -d --build

.PHONY: down
down: ## Stop the stack (keeps volumes)
	$(COMPOSE) down

.PHONY: restart
restart: down up ## Restart the whole stack

.PHONY: build
build: ## Build all images
	$(COMPOSE) build

.PHONY: ps
ps: ## Show container status
	$(COMPOSE) ps

.PHONY: logs
logs: ## Tail logs from all services
	$(COMPOSE) logs -f

.PHONY: urls
urls: ## Print the service URLs
	@echo "frontend     -> http://localhost:$${FRONTEND_PORT:-5173}"
	@echo "api          -> http://localhost:$${API_PORT:-3000}      (swagger: /api)"
	@echo "external-api -> http://localhost:$${EXTERNAL_API_PORT:-4000}"
	@echo "postgres     -> localhost:$${DB_PORT:-5432}"

.PHONY: clean
clean: ## Stop the stack and drop all volumes (DB + sqlite)
	$(COMPOSE) down -v

# --- Per-service helpers ---------------------------------------------------

.PHONY: api external-api frontend
api: ## Start only the api (+ Postgres)
	$(COMPOSE) up -d --build api
external-api: ## Start only the external api
	$(COMPOSE) up -d --build external-api
frontend: ## Start only the frontend (+ api)
	$(COMPOSE) up -d --build frontend

.PHONY: logs-api logs-external logs-frontend
logs-api: ## Tail api logs
	$(COMPOSE) logs -f api
logs-external: ## Tail external-api logs
	$(COMPOSE) logs -f external-api
logs-frontend: ## Tail frontend logs
	$(COMPOSE) logs -f frontend

# --- Tests / quality (run inside containers) -------------------------------

.PHONY: test
test: ## Run the api unit tests in a throwaway container
	$(COMPOSE) run --rm --no-deps api npm test

.PHONY: lint
lint: ## Lint the TypeScript projects (api + frontend)
	$(COMPOSE) run --rm --no-deps api npm run lint
	$(COMPOSE) run --rm --no-deps frontend npm run lint

.PHONY: wait-backend
wait-backend: ## Wait until the local API and external API answer HTTP 200
	@echo "waiting for backend services..."
	@for i in $$(seq 1 90); do \
		la=$$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$${API_PORT:-3000}/api/todolists 2>/dev/null); \
		le=$$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$${EXTERNAL_API_PORT:-4000}/todolists 2>/dev/null); \
		echo "attempt=$$i api=$$la external=$$le"; \
		if [ "$$la" = "200" ] && [ "$$le" = "200" ]; then exit 0; fi; \
		sleep 2; \
	done; \
	echo "backend services did not become ready"; \
	exit 1

.PHONY: verify-reset
verify-reset: ## Reset volumes and start api + external-api with scheduler disabled
	$(MAKE) clean
	SYNC_CRON_ENABLED=false $(COMPOSE) up -d --build postgres api external-api
	$(MAKE) wait-backend

.PHONY: verify-quality
verify-quality: ## Run backend tests, build, lint, prettier, and whitespace checks
	$(MAKE) verify-reset
	$(COMPOSE) exec -T api npm test -- --runInBand
	$(COMPOSE) exec -T api npm run build
	$(COMPOSE) exec -T api npm run lint -- --max-warnings=0
	$(COMPOSE) exec -T api npx prettier --check "src/**/*.ts"
	git diff --check

.PHONY: functional-test
functional-test: ## Reset backend stack + seed + run the black-box curl suite
	$(MAKE) verify-reset
	$(MAKE) seed
	bash scripts/functional-test.sh

.PHONY: verify-manual-sync
verify-manual-sync: ## Reset + seed + run manual sync smoke checks
	$(MAKE) verify-reset
	$(MAKE) seed
	bash scripts/manual-sync-smoke.sh

.PHONY: verify-endpoints
verify-endpoints: ## Reset + seed + smoke-test local/external CRUD endpoints
	$(MAKE) verify-reset
	$(MAKE) seed
	bash scripts/endpoint-smoke.sh

.PHONY: verify-schema
verify-schema: ## Reset + seed + assert todo_item has no local description column
	$(MAKE) verify-reset
	$(MAKE) seed
	@actual=$$($(COMPOSE) exec -T postgres psql -U postgres -d nestjs_db -tA -c "SELECT column_name FROM information_schema.columns WHERE table_name='todo_item' ORDER BY ordinal_position;" | paste -sd, -); \
	expected='id,title,completed,todoListId,externalId,syncStatus,createdAt,updatedAt,deletedAt'; \
	echo "todo_item columns: $$actual"; \
	if [ "$$actual" != "$$expected" ]; then \
		echo "expected columns: $$expected"; \
		exit 1; \
	fi

.PHONY: verify-backend
verify-backend: ## Run the full backend sync verification suite
	$(MAKE) verify-quality
	$(MAKE) functional-test
	$(MAKE) verify-manual-sync
	$(MAKE) verify-endpoints
	$(MAKE) verify-schema

# --- Seeding ---------------------------------------------------------------

.PHONY: seed
seed: seed-local seed-external ## Seed both APIs with demo data (stack must be up)

.PHONY: seed-local
seed-local: ## Seed the local API's Postgres
	$(COMPOSE) exec -T api npm run seed

.PHONY: seed-external
seed-external: ## Seed the external API over HTTP (no changes to its code)
	./scripts/seed-external.sh

# --- Conversation transcripts ---------------------------------------------

.PHONY: transcript
transcript: ## Export the AI development transcripts into ./transcripts
	./scripts/export-transcript.sh
