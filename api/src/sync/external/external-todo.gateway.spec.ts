import { ExternalTodoGateway } from './external-todo.gateway';
import { UnsupportedRemoteOperationError } from './unsupported-remote-operation.error';

function wireList(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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

function wireItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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

describe('ExternalTodoGateway', () => {
  const originalFetch = globalThis.fetch;
  const originalRetryDelay = process.env.EXTERNAL_API_RETRY_BASE_DELAY_MS;

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
    if (originalRetryDelay === undefined) {
      delete process.env.EXTERNAL_API_RETRY_BASE_DELAY_MS;
    } else {
      process.env.EXTERNAL_API_RETRY_BASE_DELAY_MS = originalRetryDelay;
    }
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

  it('retries transient remote failures', async () => {
    process.env.EXTERNAL_API_RETRY_BASE_DELAY_MS = '1';
    const mock = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
      .mockResolvedValueOnce(
        new Response('temporarily unavailable', { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([wireList()]), { status: 200 }),
      );
    globalThis.fetch = mock;
    const gateway = new ExternalTodoGateway();

    const lists = await gateway.fetchAll();

    expect(lists).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('does not retry terminal client errors', async () => {
    const mock = installFetch(new Response('bad request', { status: 400 }));
    const gateway = new ExternalTodoGateway();

    await expect(gateway.fetchAll()).rejects.toThrow(
      'Remote GET /todolists failed with status 400',
    );
    expect(mock).toHaveBeenCalledTimes(1);
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

  it('updateList patches the list and returns the parsed result', async () => {
    const mock = installFetch(
      new Response(JSON.stringify(wireList({ name: 'Renamed' })), {
        status: 200,
      }),
    );
    const gateway = new ExternalTodoGateway();

    const result = await gateway.updateList('L1', { name: 'Renamed' });

    expect(result.name).toBe('Renamed');
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toContain('/todolists/L1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Renamed' });
  });

  it('deleteList issues a DELETE on the list path', async () => {
    const mock = installFetch(new Response(null, { status: 204 }));
    const gateway = new ExternalTodoGateway();

    await expect(gateway.deleteList('L1')).resolves.toBeUndefined();
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toContain('/todolists/L1');
    expect(init?.method).toBe('DELETE');
  });

  it('updateItem patches the item, mapping title -> description', async () => {
    const mock = installFetch(
      new Response(
        JSON.stringify(wireItem({ description: 'done', completed: true })),
        {
          status: 200,
        },
      ),
    );
    const gateway = new ExternalTodoGateway();

    const result = await gateway.updateItem('L1', 'I1', {
      title: 'done',
      completed: true,
    });

    expect(result.title).toBe('done');
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toContain('/todolists/L1/todoitems/I1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({
      description: 'done',
      completed: true,
    });
  });

  it('deleteItem issues a DELETE on the nested item path', async () => {
    const mock = installFetch(new Response(null, { status: 204 }));
    const gateway = new ExternalTodoGateway();

    await expect(gateway.deleteItem('L1', 'I1')).resolves.toBeUndefined();
    expect(String(mock.mock.calls[0][0])).toContain(
      '/todolists/L1/todoitems/I1',
    );
  });
});
