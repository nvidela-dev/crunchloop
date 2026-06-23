# nextjs-interview / TodoApi

[![Open in Coder](https://dev.crunchloop.io/open-in-coder.svg)](https://dev.crunchloop.io/templates/fly-containers/workspace?param.Git%20Repository=git@github.com:crunchloop/nextjs-interview.git)

This is a simple Todo List API built in Nest JS and Typescript. This project is currently being used for Javascript/Typescript full-stack candidates.

It exposes CRUD for **todo lists** and the **items** nested under them, backed by
Postgres via TypeORM.

## Data model

- **TodoList** — `id`, `name`, and a one-to-many `items` relation.
- **TodoItem** — `id`, `title`, `description`, `completed`, `todoListId`.
  Items belong to a list via a `ManyToOne` relation with `onDelete: CASCADE`,
  so deleting a list removes its items.

## Endpoints

| Method | Path                                       | Description          |
| ------ | ------------------------------------------ | -------------------- |
| GET    | `/api/todolists`                           | List todo lists      |
| POST   | `/api/todolists`                           | Create a todo list   |
| GET    | `/api/todolists/:todoListId`               | Get one todo list    |
| PUT    | `/api/todolists/:todoListId`               | Update a todo list   |
| DELETE | `/api/todolists/:todoListId`               | Delete a todo list   |
| GET    | `/api/todolists/:todoListId/items`         | List items in a list |
| POST   | `/api/todolists/:todoListId/items`         | Create an item       |
| GET    | `/api/todolists/:todoListId/items/:itemId` | Get one item         |
| PUT    | `/api/todolists/:todoListId/items/:itemId` | Update an item       |
| DELETE | `/api/todolists/:todoListId/items/:itemId` | Delete an item       |

Interactive Swagger docs are served at `http://localhost:3000/api`.

## Running with Docker (recommended)

The whole stack (API + Postgres) is dockerized. A `Makefile` wraps the common
commands — run `make` to see them all.

```bash
# Build and start API + Postgres in the background
$ make up

# Tail logs
$ make logs

# Stop (keeps the database volume)
$ make down
```

The API listens on `http://localhost:3000`.

### Dev container

The repo ships a dev container (`.devcontainer/`). Open the folder in VS Code and
choose **Reopen in Container**: it brings up Postgres, installs dependencies
(`postCreateCommand`), and forwards ports `3000`/`5432`.

## Running locally (host Node)

Requires Node 20+. Point the app at a Postgres instance via `.env` (copy
`.env.example`). You can start just the database with Docker:

```bash
$ make install      # npm ci
$ make db           # start Postgres only
$ make dev          # nest start --watch
```

## Test

```bash
$ make test         # unit tests
$ make lint         # eslint --fix
$ make check        # lint + build + test (what CI runs)
```

Check integration tests at: (https://github.com/crunchloop/interview-tests)

## AI transcripts

This solution was built with AI assistance. The conversation transcripts are
exported into [`transcripts/`](./transcripts) as `.jsonl`. Refresh the snapshot
with:

```bash
$ make transcript
```

## Contact

- Martín Fernández (mfernandez@crunchloop.io)

## About Crunchloop

![crunchloop](https://s3.amazonaws.com/crunchloop.io/logo-blue.png)

We strongly believe in giving back :rocket:. Let's work together [`Get in touch`](https://crunchloop.io/#contact).
