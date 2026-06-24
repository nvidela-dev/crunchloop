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
  private readonly baseUrl =
    process.env.EXTERNAL_API_URL ?? 'http://external-api:4000';

  async fetchAll(): Promise<RemoteTodoList[]> {
    const response = await fetch(`${this.baseUrl}/todolists`);
    if (!response.ok) {
      throw new Error(`Remote fetchAll failed with status ${response.status}`);
    }
    return parseRemoteLists(await response.json());
  }

  async createList(draft: RemoteTodoListDraft): Promise<RemoteTodoList> {
    const response = await fetch(`${this.baseUrl}/todolists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toListPayload(draft)),
    });
    if (!response.ok) {
      throw new Error(`Remote createList failed with status ${response.status}`);
    }
    return parseRemoteList(await response.json());
  }

  async updateList(
    externalId: string,
    patch: RemoteTodoListPatch,
  ): Promise<RemoteTodoList> {
    const response = await fetch(`${this.baseUrl}/todolists/${externalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toListPatch(patch)),
    });
    if (!response.ok) {
      throw new Error(`Remote updateList failed with status ${response.status}`);
    }
    return parseRemoteList(await response.json());
  }

  async deleteList(externalId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/todolists/${externalId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Remote deleteList failed with status ${response.status}`);
    }
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
    const response = await fetch(
      `${this.baseUrl}/todolists/${listExternalId}/todoitems/${itemExternalId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toItemPatch(patch)),
      },
    );
    if (!response.ok) {
      throw new Error(`Remote updateItem failed with status ${response.status}`);
    }
    return parseRemoteItem(await response.json());
  }

  async deleteItem(
    listExternalId: string,
    itemExternalId: string,
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/todolists/${listExternalId}/todoitems/${itemExternalId}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      throw new Error(`Remote deleteItem failed with status ${response.status}`);
    }
  }
}
