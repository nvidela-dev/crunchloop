import { ExternalTodoGateway } from './external-todo.gateway';
import { UnsupportedRemoteOperationError } from './unsupported-remote-operation.error';

function wireList(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'L1',
    source_id: 'src-1',
    name: 'Groceries',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    items: [],
    ...overrides,
  };
}

describe('ExternalTodoGateway', () => {
  const originalFetch = globalThis.fetch;

  function installFetch(
    response: Response,
  ): jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]> {
    const mock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>(
      () => Promise.resolve(response),
    );
    globalThis.fetch = mock;
    return mock;
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetchAll parses the remote payload into domain lists', async () => {
    const mock = installFetch(
      new Response(JSON.stringify([wireList()]), { status: 200 }),
    );
    const gateway = new ExternalTodoGateway();

    const lists = await gateway.fetchAll();

    expect(lists).toHaveLength(1);
    expect(lists[0].externalId).toBe('L1');
    expect(String(mock.mock.calls[0][0])).toContain('/todolists');
  });

  it('fetchAll throws on a non-ok response', async () => {
    installFetch(new Response('boom', { status: 500 }));
    const gateway = new ExternalTodoGateway();

    await expect(gateway.fetchAll()).rejects.toThrow();
  });

  it('createList posts the mapped payload and returns the created list', async () => {
    const mock = installFetch(
      new Response(JSON.stringify(wireList({ id: 'NEW', source_id: '1' })), {
        status: 201,
      }),
    );
    const gateway = new ExternalTodoGateway();

    const result = await gateway.createList({
      sourceId: '1',
      name: 'Groceries',
      items: [{ sourceId: '2', title: 'Buy milk', completed: false }],
    });

    expect(result.externalId).toBe('NEW');

    const init = mock.mock.calls[0][1];
    const body: unknown = JSON.parse(String(init?.body));
    expect(body).toEqual({
      source_id: '1',
      name: 'Groceries',
      items: [{ source_id: '2', description: 'Buy milk', completed: false }],
    });
  });

  it('createItem rejects with the unsupported-operation placeholder', async () => {
    const gateway = new ExternalTodoGateway();

    await expect(
      gateway.createItem('L1', { sourceId: '2', title: 'x', completed: false }),
    ).rejects.toBeInstanceOf(UnsupportedRemoteOperationError);
  });
});
