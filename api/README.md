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

## Running

This API is one of three services in the [crunchloop monorepo](../README.md).
From the **repo root**:

```bash
make up          # start this API (+ Postgres), the external API, and the frontend
make logs-api    # tail this service's logs
make test        # run the unit tests below
```

The API listens on `http://localhost:3000` (Swagger at `/api`). Configuration is
read from environment variables — `PORT`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`,
`DB_PASSWORD`, `DB_DATABASE` — which the compose file wires to the `postgres`
service.

### Standalone (host Node)

Requires Node 20+ and a reachable Postgres (copy `.env.example` to `.env`):

```bash
npm install
npm run start:dev
```

## Test

```bash
npm test          # unit tests
npm run lint      # eslint --fix
npm run build     # compile
```

Check integration tests at: (https://github.com/crunchloop/interview-tests)

## Contact

- Martín Fernández (mfernandez@crunchloop.io)

## About Crunchloop

![crunchloop](https://s3.amazonaws.com/crunchloop.io/logo-blue.png)

We strongly believe in giving back :rocket:. Let's work together [`Get in touch`](https://crunchloop.io/#contact).
