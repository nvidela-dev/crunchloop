import { Injectable } from '@nestjs/common';
import { RemoteTodoGateway } from '../remote-todo.gateway';
import { RemoteTodoList, RemoteTodoListDraft } from '../domain/remote-todo-list';
import { RemoteTodoItem, RemoteTodoItemDraft } from '../domain/remote-todo-item';
import {
  parseRemoteList,
  parseRemoteLists,
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
}
