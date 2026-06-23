import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { TodoList } from './todo_lists/todo_list.entity';
import { TodoItem } from './todo_items/todo_item.entity';

// Seeds the LOCAL API's Postgres with some demo data. Idempotent: it hard-resets
// the tables first (ignoring soft-delete tombstones) so re-running is safe.
// These rows have externalId = null — they are "local-only" until the sync
// engine pushes them to the external API.
async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get(DataSource);
    const lists = dataSource.getRepository(TodoList);
    const items = dataSource.getRepository(TodoItem);

    // Reset (items first to satisfy the FK).
    await dataSource.createQueryBuilder().delete().from(TodoItem).execute();
    await dataSource.createQueryBuilder().delete().from(TodoList).execute();

    const groceries = await lists.save(
      lists.create({ name: 'Groceries (local)' }),
    );
    await items.save([
      items.create({
        title: 'Milk',
        description: 'Whole milk',
        todoListId: groceries.id,
      }),
      items.create({
        title: 'Bread',
        description: 'Sourdough',
        completed: true,
        todoListId: groceries.id,
      }),
    ]);

    const interview = await lists.save(
      lists.create({ name: 'Interview prep (local)' }),
    );
    await items.save([
      items.create({
        title: 'Review NestJS modules',
        description: 'Providers and dependency injection',
        todoListId: interview.id,
      }),
      items.create({
        title: 'Practice TypeORM',
        description: 'Relations and soft delete',
        todoListId: interview.id,
      }),
    ]);

    const [listCount, itemCount] = await Promise.all([
      lists.count(),
      items.count(),
    ]);
    console.log(`Seeded local API: ${listCount} lists, ${itemCount} items.`);
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
