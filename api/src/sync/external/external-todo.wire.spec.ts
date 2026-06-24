import {
  parseRemoteList,
  parseRemoteLists,
  toItemPayload,
  toListPayload,
} from './external-todo.wire';

function wireItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'I1',
    source_id: 'src-i1',
    description: 'Buy milk',
    completed: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function wireList(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'L1',
    source_id: 'src-1',
    name: 'Groceries',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    items: [wireItem()],
    ...overrides,
  };
}

describe('external-todo.wire', () => {
  describe('parseRemoteList', () => {
    it('maps the wire shape onto the agnostic domain model', () => {
      const list = parseRemoteList(wireList());

      expect(list.externalId).toBe('L1');
      expect(list.sourceId).toBe('src-1');
      expect(list.name).toBe('Groceries');
      expect(list.updatedAt).toBeInstanceOf(Date);
      expect(list.updatedAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');

      expect(list.items).toHaveLength(1);
      expect(list.items[0].externalId).toBe('I1');
      expect(list.items[0].title).toBe('Buy milk');
      expect(list.items[0].completed).toBe(false);
      expect(list.items[0].updatedAt).toBeInstanceOf(Date);
    });

    it('coerces a numeric completed flag to a boolean', () => {
      const one = parseRemoteList(wireList({ items: [wireItem({ completed: 1 })] }));
      const zero = parseRemoteList(wireList({ items: [wireItem({ completed: 0 })] }));

      expect(one.items[0].completed).toBe(true);
      expect(zero.items[0].completed).toBe(false);
    });

    it('keeps a null source_id as null', () => {
      const list = parseRemoteList(wireList({ source_id: null }));
      expect(list.sourceId).toBeNull();
    });

    it('rejects a missing required field', () => {
      const broken = wireList();
      delete broken.id;
      expect(() => parseRemoteList(broken)).toThrow();
    });

    it('rejects a wrong-typed field', () => {
      expect(() => parseRemoteList(wireList({ name: 123 }))).toThrow();
    });

    it('rejects an invalid date', () => {
      expect(() => parseRemoteList(wireList({ updated_at: 'not-a-date' }))).toThrow();
    });

    it('rejects when items is not an array', () => {
      expect(() => parseRemoteList(wireList({ items: 'nope' }))).toThrow();
    });

    it('rejects a non-object', () => {
      expect(() => parseRemoteList(null)).toThrow();
      expect(() => parseRemoteList('string')).toThrow();
    });
  });

  describe('parseRemoteLists', () => {
    it('parses an array of lists', () => {
      const lists = parseRemoteLists([wireList(), wireList({ id: 'L2' })]);
      expect(lists.map((l) => l.externalId)).toEqual(['L1', 'L2']);
    });

    it('rejects a non-array', () => {
      expect(() => parseRemoteLists(wireList())).toThrow();
    });
  });

  describe('serialization (domain draft -> wire payload)', () => {
    it('maps an item draft, title -> description', () => {
      expect(
        toItemPayload({ sourceId: '2', title: 'Buy milk', completed: true }),
      ).toEqual({ source_id: '2', description: 'Buy milk', completed: true });
    });

    it('maps a list draft with its items', () => {
      expect(
        toListPayload({
          sourceId: '1',
          name: 'Groceries',
          items: [{ sourceId: '2', title: 'Buy milk', completed: false }],
        }),
      ).toEqual({
        source_id: '1',
        name: 'Groceries',
        items: [{ source_id: '2', description: 'Buy milk', completed: false }],
      });
    });
  });
});
