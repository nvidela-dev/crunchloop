import { Injectable } from '@nestjs/common';
import { RemoteTodoGateway } from '../remote-todo.gateway';
import {
  RemoteTodoList,
  RemoteTodoListDraft,
  RemoteTodoListPatch,
} from '../domain/remote-todo-list';
import {
  RemoteTodoItem,
  RemoteTodoItemDraft,
  RemoteTodoItemPatch,
} from '../domain/remote-todo-item';
import {
  parseRemoteItem,
  parseRemoteList,
  parseRemoteLists,
  toItemPatch,
  toListPatch,
  toListPayload,
} from './external-todo.wire';
import { UnsupportedRemoteOperationError } from './unsupported-remote-operation.error';

@Injectable()
export class ExternalTodoGateway extends RemoteTodoGateway {
  private readonly baseUrl = (
    process.env.EXTERNAL_API_URL ?? 'http://external-api:4000'
  ).replace(/\/$/, '');
  private readonly timeoutMs = readPositiveInt('EXTERNAL_API_TIMEOUT_MS', 5000);
  private readonly maxAttempts = readPositiveInt(
    'EXTERNAL_API_RETRY_ATTEMPTS',
    3,
  );
  private readonly retryBaseDelayMs = readPositiveInt(
    'EXTERNAL_API_RETRY_BASE_DELAY_MS',
    100,
  );

  async fetchAll(): Promise<RemoteTodoList[]> {
    return parseRemoteLists(await this.requestJson('/todolists'));
  }

  async createList(draft: RemoteTodoListDraft): Promise<RemoteTodoList> {
    const payload = await this.requestJson('/todolists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toListPayload(draft)),
    });
    return parseRemoteList(payload);
  }

  async updateList(
    externalId: string,
    patch: RemoteTodoListPatch,
  ): Promise<RemoteTodoList> {
    const payload = await this.requestJson(`/todolists/${externalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toListPatch(patch)),
    });
    return parseRemoteList(payload);
  }

  async deleteList(externalId: string): Promise<void> {
    await this.request(`/todolists/${externalId}`, {
      method: 'DELETE',
    });
  }

  createItem(
    listExternalId: string,
    draft: RemoteTodoItemDraft,
  ): Promise<RemoteTodoItem> {
    return Promise.reject(
      new UnsupportedRemoteOperationError(
        `createItem(list=${listExternalId}, item=${draft.sourceId})`,
      ),
    );
  }

  async updateItem(
    listExternalId: string,
    itemExternalId: string,
    patch: RemoteTodoItemPatch,
  ): Promise<RemoteTodoItem> {
    const payload = await this.requestJson(
      `/todolists/${listExternalId}/todoitems/${itemExternalId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toItemPatch(patch)),
      },
    );
    return parseRemoteItem(payload);
  }

  async deleteItem(
    listExternalId: string,
    itemExternalId: string,
  ): Promise<void> {
    await this.request(
      `/todolists/${listExternalId}/todoitems/${itemExternalId}`,
      { method: 'DELETE' },
    );
  }

  private async requestJson(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    const response = await this.request(path, init);
    return await response.json();
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
        });

        if (response.ok) {
          return response;
        }

        const body = await readBody(response);
        const error = new ExternalTodoRequestError(
          `Remote ${init.method ?? 'GET'} ${path} failed with status ${
            response.status
          }${body ? `: ${body}` : ''}`,
          isRetryableStatus(response.status),
        );

        if (!error.retryable || attempt === this.maxAttempts) {
          throw error;
        }
        lastError = error;
      } catch (error) {
        const normalizedError = normalizeRequestError(error, path, init);
        if (
          !isRetryableError(normalizedError) ||
          attempt === this.maxAttempts
        ) {
          throw normalizedError;
        }
        lastError = normalizedError;
      } finally {
        clearTimeout(timeout);
      }

      await delay(this.retryBaseDelayMs * 2 ** (attempt - 1));
    }

    throw (
      lastError ?? new Error(`Remote ${init.method ?? 'GET'} ${path} failed`)
    );
  }
}

class ExternalTodoRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  return error instanceof ExternalTodoRequestError ? error.retryable : true;
}

function normalizeRequestError(
  error: unknown,
  path: string,
  init: RequestInit,
): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error(`Remote ${init.method ?? 'GET'} ${path} timed out`);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.clone().text();
  } catch {
    return '';
  }
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
