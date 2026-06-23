# Crunchloop Todo — three-service stack

This repository hosts **three independent projects** that run together as
separate Docker containers, orchestrated by a single `docker-compose.yml` and a
top-level `Makefile`.

| Folder          | Project                          | Stack                    | URL                     |
| --------------- | -------------------------------- | ------------------------ | ----------------------- |
| `frontend/`     | Todo UI                          | React 19 + Vite          | http://localhost:5173   |
| `api/`          | Local Todo API                   | NestJS 11 + TypeORM + PG | http://localhost:3000   |
| `external-api/` | External Todo API                | Express + node:sqlite    | http://localhost:4000   |
| —               | Postgres (for `api/`)            | postgres:17              | localhost:5432          |

Each project keeps its own structure, dependencies, and `Dockerfile`; they only
share the compose network. Ports are predictable and overridable via a root
`.env` (copy `.env.example`).

## Run everything

```bash
make up        # build + start all containers
make ps        # status
make urls      # print the service URLs
make logs      # tail all logs
make down      # stop (keeps data)
make clean     # stop + drop volumes (Postgres + SQLite)
```

Start a single service with `make api`, `make external-api`, or `make frontend`.

## The APIs

**Local API (`api/`, port 3000)** — CRUD for todo lists and nested items, Swagger
at http://localhost:3000/api. Routes are under `/api/todolists`.

**External API (`external-api/`, port 4000)** — the external Todo API the local
API will sync with. Routes are at the root (`/todolists`). See
[`external-api/README.md`](external-api/README.md).

## Tests

```bash
make test      # api unit tests (in a throwaway container)
make lint      # api lint
```

## AI transcripts

The development conversation log lives in [`transcripts/`](transcripts) as
`.jsonl`. Refresh it with `make transcript`.
