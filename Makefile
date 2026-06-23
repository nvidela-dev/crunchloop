# Todo API — developer entrypoints.
# Run `make` or `make help` to see available targets.

# Use bash for recipes (pipefail, etc.)
SHELL := /bin/bash

# Prefer the v2 docker compose plugin; fall back to legacy docker-compose.
COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- Local (host) workflow -------------------------------------------------

.PHONY: install
install: ## Install npm dependencies (npm ci)
	npm ci

.PHONY: db
db: ## Start only Postgres in the background
	$(COMPOSE) up -d postgres

.PHONY: dev
dev: ## Run the API in watch mode against the dockerized Postgres
	npm run start:dev

.PHONY: start
start: ## Run the API once (no watch)
	npm run start

.PHONY: build
build: ## Compile the project
	npm run build

.PHONY: test
test: ## Run unit tests
	npm test

.PHONY: lint
lint: ## Lint and auto-fix
	npm run lint

.PHONY: check
check: lint build test ## Lint + build + test (what CI runs)

# --- Full dockerized stack -------------------------------------------------

.PHONY: up
up: ## Build and run the full stack (API + Postgres) in the background
	$(COMPOSE) up -d --build

.PHONY: logs
logs: ## Tail logs from the running stack
	$(COMPOSE) logs -f

.PHONY: down
down: ## Stop the stack (keeps the database volume)
	$(COMPOSE) down

.PHONY: clean
clean: ## Stop the stack, drop the database volume, remove build output
	$(COMPOSE) down -v
	rm -rf dist coverage

# --- Conversation transcripts ---------------------------------------------

.PHONY: transcript
transcript: ## Export the AI conversation transcripts (.jsonl) into ./transcripts
	./scripts/export-transcript.sh
