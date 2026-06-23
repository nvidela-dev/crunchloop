# Crunch External Todo API

Minimal Express.js implementation of the external Todo API described by `crunchloop/challenge-senior-engineer`.

## Run

```sh
npm install
npm start
```

The server listens on `http://localhost:3000` by default. Set `PORT` to change it.

Data is persisted in SQLite at `data/todos.sqlite`. The database is seeded the first time that file is created.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/todolists` | Fetch all TodoLists and their items |
| `POST` | `/todolists` | Create a new TodoList with items |
| `PATCH` | `/todolists/:todolistId` | Update a TodoList |
| `DELETE` | `/todolists/:todolistId` | Delete a TodoList and its items |
| `PATCH` | `/todolists/:todolistId/todoitems/:todoitemId` | Update a TodoItem |
| `DELETE` | `/todolists/:todolistId/todoitems/:todoitemId` | Delete a TodoItem |

Every request and mutation is logged as JSON to stdout.

## Example

```sh
curl -s http://localhost:3000/todolists

curl -s -X POST http://localhost:3000/todolists \
  -H 'Content-Type: application/json' \
  -d '{
    "source_id": "external-list-1",
    "name": "Demo list",
    "items": [
      {
        "source_id": "external-item-1",
        "description": "Explore synchronization",
        "completed": false
      }
    ]
  }'
```
