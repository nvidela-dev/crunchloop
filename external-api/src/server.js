const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const express = require("express");

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "..", "data");
const databasePath = path.join(dataDir, "todos.sqlite");
const databaseAlreadyExists = fs.existsSync(databasePath);

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

initializeDatabase();

app.use(express.json());

app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  req.requestId = requestId;

  log("request:start", {
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    body: req.body
  });

  res.on("finish", () => {
    log("request:finish", {
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt
    });
  });

  next();
});

app.get("/todolists", (req, res) => {
  const lists = findTodoLists();

  log("todolist:list", {
    request_id: req.requestId,
    count: lists.length
  });

  res.status(200).json(lists);
});

app.post("/todolists", (req, res) => {
  const list = insertTodoList(req.body);

  log("todolist:create", {
    request_id: req.requestId,
    todolist_id: list.id,
    source_id: list.source_id,
    item_count: list.items.length
  });

  res.status(201).json(list);
});

app.patch("/todolists/:todolistId", (req, res) => {
  const list = findTodoList(req.params.todolistId);

  if (!list) {
    return notFound(req, res, "TodoList not found", {
      todolist_id: req.params.todolistId
    });
  }

  const updatedList = updateTodoList(req.params.todolistId, req.body);

  log("todolist:update", {
    request_id: req.requestId,
    todolist_id: updatedList.id,
    body: req.body
  });

  res.status(200).json(updatedList);
});

app.delete("/todolists/:todolistId", (req, res) => {
  const list = findTodoList(req.params.todolistId);

  if (!list) {
    return notFound(req, res, "TodoList not found", {
      todolist_id: req.params.todolistId
    });
  }

  deleteTodoList(list.id);

  log("todolist:delete", {
    request_id: req.requestId,
    todolist_id: list.id,
    deleted_item_count: list.items.length
  });

  res.status(204).send();
});

app.patch("/todolists/:todolistId/todoitems/:todoitemId", (req, res) => {
  const list = findTodoList(req.params.todolistId);

  if (!list) {
    return notFound(req, res, "TodoList not found", {
      todolist_id: req.params.todolistId
    });
  }

  const item = findTodoItem(req.params.todolistId, req.params.todoitemId);

  if (!item) {
    return notFound(req, res, "TodoItem not found", {
      todolist_id: list.id,
      todoitem_id: req.params.todoitemId
    });
  }

  const updatedItem = updateTodoItem(req.params.todolistId, req.params.todoitemId, req.body);

  log("todoitem:update", {
    request_id: req.requestId,
    todolist_id: list.id,
    todoitem_id: updatedItem.id,
    body: req.body
  });

  res.status(200).json(updatedItem);
});

app.delete("/todolists/:todolistId/todoitems/:todoitemId", (req, res) => {
  const list = findTodoList(req.params.todolistId);

  if (!list) {
    return notFound(req, res, "TodoList not found", {
      todolist_id: req.params.todolistId
    });
  }

  const item = findTodoItem(req.params.todolistId, req.params.todoitemId);

  if (!item) {
    return notFound(req, res, "TodoItem not found", {
      todolist_id: list.id,
      todoitem_id: req.params.todoitemId
    });
  }

  deleteTodoItem(req.params.todolistId, req.params.todoitemId);

  log("todoitem:delete", {
    request_id: req.requestId,
    todolist_id: list.id,
    todoitem_id: item.id,
    remaining_item_count: list.items.length - 1
  });

  res.status(204).send();
});

app.use((req, res) => {
  notFound(req, res, "Route not found", {
    method: req.method,
    path: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    log("request:invalid_json", {
      request_id: req.requestId,
      message: err.message
    });

    return res.status(400).json({ error: "Invalid JSON request body" });
  }

  log("request:error", {
    request_id: req.requestId,
    message: err.message,
    stack: err.stack
  });

  res.status(500).json({ error: "Internal server error" });
});

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_lists (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      name TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS todo_items (
      id TEXT PRIMARY KEY,
      todolist_id TEXT NOT NULL,
      source_id TEXT,
      description TEXT,
      completed INTEGER,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (todolist_id) REFERENCES todo_lists(id) ON DELETE CASCADE
    );
  `);

  if (!databaseAlreadyExists) {
    seedDatabase();
  }

  log("database:ready", {
    path: databasePath,
    seeded: !databaseAlreadyExists
  });
}

function seedDatabase() {
  const now = timestamp();

  runTransaction(() => {
    db.prepare(`
      INSERT INTO todo_lists (id, source_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("seed-list-1", "seed-source-list-1", "Seeded onboarding list", now, now);

    db.prepare(`
      INSERT INTO todo_items (
        id,
        todolist_id,
        source_id,
        description,
        completed,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "seed-item-1",
      "seed-list-1",
      "seed-source-item-1",
      "Review the external API shape",
      0,
      now,
      now
    );

    db.prepare(`
      INSERT INTO todo_items (
        id,
        todolist_id,
        source_id,
        description,
        completed,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "seed-item-2",
      "seed-list-1",
      "seed-source-item-2",
      "Test synchronization from a client app",
      0,
      now,
      now
    );
  });

  log("database:seed", {
    path: databasePath,
    todolist_id: "seed-list-1",
    item_count: 2
  });
}

function findTodoLists() {
  const rows = db.prepare(`
    SELECT id, source_id, name, created_at, updated_at
    FROM todo_lists
    ORDER BY created_at ASC, id ASC
  `).all();

  return rows.map((row) => ({
    ...mapTodoListRow(row),
    items: findTodoItems(row.id)
  }));
}

function findTodoList(todolistId) {
  const row = db.prepare(`
    SELECT id, source_id, name, created_at, updated_at
    FROM todo_lists
    WHERE id = ?
  `).get(todolistId);

  if (!row) {
    return null;
  }

  return {
    ...mapTodoListRow(row),
    items: findTodoItems(row.id)
  };
}

function findTodoItems(todolistId) {
  const rows = db.prepare(`
    SELECT id, source_id, description, completed, created_at, updated_at
    FROM todo_items
    WHERE todolist_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(todolistId);

  return rows.map(mapTodoItemRow);
}

function findTodoItem(todolistId, todoitemId) {
  const row = db.prepare(`
    SELECT id, source_id, description, completed, created_at, updated_at
    FROM todo_items
    WHERE todolist_id = ? AND id = ?
  `).get(todolistId, todoitemId);

  return row ? mapTodoItemRow(row) : null;
}

function insertTodoList(body) {
  const now = timestamp();
  const list = {
    id: crypto.randomUUID(),
    source_id: valueOrNull(body.source_id),
    name: valueOrNull(body.name),
    created_at: now,
    updated_at: now,
    items: Array.isArray(body.items)
      ? body.items.map((item) => createTodoItem(item, now))
      : []
  };

  runTransaction(() => {
    db.prepare(`
      INSERT INTO todo_lists (id, source_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(list.id, list.source_id, list.name, list.created_at, list.updated_at);

    const insertItem = db.prepare(`
      INSERT INTO todo_items (
        id,
        todolist_id,
        source_id,
        description,
        completed,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of list.items) {
      insertItem.run(
        item.id,
        list.id,
        item.source_id,
        item.description,
        booleanToDatabase(item.completed),
        item.created_at,
        item.updated_at
      );
    }
  });

  return findTodoList(list.id);
}

function updateTodoList(todolistId, body) {
  const existingList = findTodoList(todolistId);
  const name = Object.prototype.hasOwnProperty.call(body, "name")
    ? valueOrNull(body.name)
    : existingList.name;
  const now = timestamp();

  db.prepare(`
    UPDATE todo_lists
    SET name = ?, updated_at = ?
    WHERE id = ?
  `).run(name, now, todolistId);

  return findTodoList(todolistId);
}

function deleteTodoList(todolistId) {
  db.prepare("DELETE FROM todo_lists WHERE id = ?").run(todolistId);
}

function updateTodoItem(todolistId, todoitemId, body) {
  const existingItem = findTodoItem(todolistId, todoitemId);
  const description = Object.prototype.hasOwnProperty.call(body, "description")
    ? valueOrNull(body.description)
    : existingItem.description;
  const completed = Object.prototype.hasOwnProperty.call(body, "completed")
    ? valueOrNull(body.completed)
    : existingItem.completed;
  const now = timestamp();

  runTransaction(() => {
    db.prepare(`
      UPDATE todo_items
      SET description = ?, completed = ?, updated_at = ?
      WHERE todolist_id = ? AND id = ?
    `).run(description, booleanToDatabase(completed), now, todolistId, todoitemId);

    db.prepare(`
      UPDATE todo_lists
      SET updated_at = ?
      WHERE id = ?
    `).run(now, todolistId);
  });

  return findTodoItem(todolistId, todoitemId);
}

function deleteTodoItem(todolistId, todoitemId) {
  const now = timestamp();

  runTransaction(() => {
    db.prepare(`
      DELETE FROM todo_items
      WHERE todolist_id = ? AND id = ?
    `).run(todolistId, todoitemId);

    db.prepare(`
      UPDATE todo_lists
      SET updated_at = ?
      WHERE id = ?
    `).run(now, todolistId);
  });
}

function createTodoItem(body, now) {
  return {
    id: crypto.randomUUID(),
    source_id: valueOrNull(body && body.source_id),
    description: valueOrNull(body && body.description),
    completed: valueOrNull(body && body.completed),
    created_at: now,
    updated_at: now
  };
}

function mapTodoListRow(row) {
  return {
    id: row.id,
    source_id: row.source_id,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapTodoItemRow(row) {
  return {
    id: row.id,
    source_id: row.source_id,
    description: row.description,
    completed: databaseToBoolean(row.completed),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function booleanToDatabase(value) {
  if (value === null) {
    return null;
  }

  return value ? 1 : 0;
}

function databaseToBoolean(value) {
  if (value === null) {
    return null;
  }

  return Boolean(value);
}

function runTransaction(callback) {
  db.exec("BEGIN");

  try {
    callback();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function valueOrNull(value) {
  return value === undefined ? null : value;
}

function timestamp() {
  return new Date().toISOString();
}

function notFound(req, res, message, details) {
  log("request:not_found", {
    request_id: req.requestId,
    message,
    ...details
  });

  return res.status(404).json({ error: message });
}

function log(event, details = {}) {
  console.log(JSON.stringify({
    event,
    at: timestamp(),
    ...details
  }));
}

app.listen(port, () => {
  log("server:start", {
    port,
    base_url: `http://localhost:${port}`,
    database_path: databasePath
  });
});
