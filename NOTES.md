# Todo API Sync Engine
  ```This project is a continuation of our work in the `Todo API`. The solution is a series of documents and a demo of the main mechanisms of the proposed solution.```

## 1. Overview
This new stage of the evaluation introduces a few new components to the problem, synchronization being the main topic.
We now have an external API and a frontend that need to share the same data, the frontend having the updated data will be a simple polling based solution, the backend APIs being in sync is the main problem being presented here, aswell as the external API being incomplete.
This will require us to make some tradeoffs in consistency, opting for an eventual achievement of it once the API is implemented if possible, in a real scenario, I would even question the usage of this external API, since the missing resources are key to a performant and idempotent solution.

## 2. The problem

- The two APIs need to be in sync, this means more than just pulling data from the API and pushing to it, this means given idempotency to our records, so they can have an identity across both services.
---
- I am provided with a `source_id` field for both lists and items.

**Todo Item**
| Name | Type | Description | Notes |
|------------ | ------------- | ------------- | -------------|
| **source\_id** | **String** | The unique identifier of the source system. | [optional] [default to null] |
| **description** | **String** | The description of the item. | [optional] [default to null] |
| **completed** | **Boolean** | Indicates whether the item is completed. | [optional] [default to null] |

Locally, `TodoItem` only stores a `title`. The external API's item
`description` maps directly to that local `title`; there is no separate local
description field to keep in sync.

**Todo List**:
| Name | Type | Description | Notes |
|------------ | ------------- | ------------- | -------------|
| **source\_id** | **String** | The unique identifier of the source system. | [optional] [default to null] |
| **name** | **String** | The name of the new TodoList. | [optional] [default to null] |
| **items** | [**List**](CreateTodoItemBody.md) | An optional list of TodoItems to create with the TodoList. | [optional] [default to null] |

---

- The [documented](https://raw.githubusercontent.com/crunchloop/challenge-senior-engineer/refs/heads/main/docs/README.md) API shows the following endpoints.

| Class | Method | HTTP request | Description |
|------------ | ------------- | ------------- | -------------|
| *TodoItemApi* | [**deleteTodoItem**](Apis/TodoItemApi.md#deletetodoitem) | **DELETE** /todolists/{todolistId}/todoitems/{todoitemId} | Delete a TodoItem |
*TodoItemApi* | [**updateTodoItem**](Apis/TodoItemApi.md#updatetodoitem) | **PATCH** /todolists/{todolistId}/todoitems/{todoitemId} | Update a TodoItem |
| *TodoListApi* | [**createTodoList**](Apis/TodoListApi.md#createtodolist) | **POST** /todolists | Create a new TodoList with items |
*TodoListApi* | [**deleteTodoList**](Apis/TodoListApi.md#deletetodolist) | **DELETE** /todolists/{todolistId} | Delete a TodoList and its items |
*TodoListApi* | [**listTodoLists**](Apis/TodoListApi.md#listtodolists) | **GET** /todolists | Fetch all TodoLists and their items |
*TodoListApi* | [**updateTodoList**](Apis/TodoListApi.md#updatetodolist) | **PATCH** /todolists/{todolistId} | Update a TodoList |


- The external API is also missing an endpoint to push new items to a list

| Class | Method | HTTP request | Description |
|------------ | ------------- | ------------- | -------------|
*TodoListApi* | [**createTodoListItem**](Apis/TodoListApi.md#updatetodolist) | **POST** /todolists/{todolistId}/items | Update a TodoList |

- I was only provided a documentation, so any exploratory work for undocumented endpoints is discarded, this would be my first approach to avoid unnecessary work.

## 3. Elaborating on the problem and some assumptions

The problem explicitly talks about making this a performant solution, and the solution requires idempotency, my first approach I explored was just deleting the whole list and pushing a new one with the updated values in the case that a new item is created, but this doesnt scale at all, as we will be pushing the whole list length for a single item change. In large datasets, this becomes an even greater issue, since we are recurrently making a big call that we need to assure happens completely, and it also breaks our idempotency unless we make another subsequent call, and we re-match, this is deffinitely a not scalable solution, and in a real life scenario, if we cannot extend the API, it would lead me to assume this external API is not right for what we are trying to achieve.

This being said, I will assume that the external API will be eventually extended, or replaced, instead of trying to force a workaround that just makes thing messy, and increases the cost of reverting to a graceful sync.

## 4. The proposed solution and its tradeoffs.

The solution is to opt for the eventual synchronization of the cases that involve pushing new items to the list, and for now, just flagging them as `pending_remote_create`, the connector to the external API should be abstract, and replaceable with a new external API seamlessly.

| Option | New items propagate | Idempotent | Data-loss risk | Complexity |
|----------|--------------------|-------------|----------------|-------------|
| **Tag + Process Later** | ✗ until RFC-001 | ✅ | None | Low |
| **Delete and Push** | ✅ | ✗ | Low–Medium | High |
| **C · Probe upsert** | n/a | n/a | None | Low |

This decision was taken after considering a few options listed above, we discarded probing the possible undocumented upsert before, since given the nature of the excercise, this wont be possible, and deleting and pushing just introduces risk of data loss, given that if the mechanism fails between the `delete remote` -> `push new remote` -> `update local` steps, we will have a syncronization issue, leading to possible data loss and unnecessary reprocessing, and even in the succesful cases we are reprocessing everything in a list, which doesnt scale.

There is an argument to be made that Todo Lists wouldnt reach sizes in which this matters, but I prefer showcasing a future proof, scalable solution, and that allows to connect a new service without having to refactor the whole sync logic in the future.

The sync should be able to process historical data later on, detecting if the connector has changed, it should re-sync with that new service seamlessly, of course once the right connector has been implemented, this will require a migration effort and some minor risk wich should be taken into account when integrating the new service.

## 5. The Sync Algorithm

Given the assumption and proposed solution, we will implement the final sync algorithm from the beggining, leaving room for changing the connector into a new API.

The algorithm is a snapshot based algorithm, which is based on a pure comparison function that then outputs a series of functions that should be executed to achieve the sync.

It will:
- `Query the External API -> External Snapshot`
- `Query the Local Database -> Local Snapshot`
- `Compare the two and output a syncronization plan`
- `Execute the actions outputted by the plan using the implemented methods from the abstract connector`

#### 5.1 Logging and Retries
This algorithm should also log its status, ammount of retries needed, and time taken to sync.

## 6. The RFC that ties the solution togheter in the future

We will create a separate RFC for the external API, requesting the adition of the new endpoint, and championing the idea that the purpose of the service isnt fully provided without this endpoint, options to this external API should be considered while the work is happening

---

**Note**:
While this document was handritten, the RFCs were created using ChatGPT, based on my reasoning and documentation generated previously, I've decided to let the LLM write the proper documents and adjusting with reviews, I think it nails the RFC format and message, hence I decided to not redudantly re-write my reasoning in a new format, and let this be the document that details the way of thinking about the problem.
