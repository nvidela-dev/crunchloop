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
lint: ## Lint the api in a throwaway container
	$(COMPOSE) run --rm --no-deps api npm run lint

# --- Conversation transcripts ---------------------------------------------

.PHONY: transcript
transcript: ## Export the AI development transcripts into ./transcripts
	./scripts/export-transcript.sh
