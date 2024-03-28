# Firestore Crud Repository

A class for providing type safe CRUD style operations on a firestore collection.

This class does not expose all the functionality available in Firestore, it is intended as an easier to use abstraction
over the operations that are used most frequently in Firestore.
For operations not directly covered by the Firestore Crud Repository, it exposes the Firestore collection to allow the 
codebase to make use of the full functionality of Firestore.

## Installation

```shell
npm install --save firebase-crud-repository
```

Example usage

```ts
import {FirestoreCrudRepository, Entity} from "firestore-crud-repository";
import {Firestore} from "@google-cloud/firestore";

// Define the interface for the entities we will be storing in our collection
interface BookEntity extends Entity {
  bookName:string
}

// set the collection name
const COLLECTION_NAME = "book"

// initialise firestore
const firestore = new Firestore()

// create a Crud Repo for Books
const bookRepo = new FirestoreCrudRepository<BookEntity>(
  firestore,
  COLLECTION_NAME,
)

// create a new book
const newBook = await bookRepo.createAndReturn({ bookName: "NAME_OF_BOOK" })

// update the new book with a different property
const updatedBook = await bookRepo.updateOneAndReturn(newBook.id, { bookName: "NEW_BOOK_NAME" })

// get some books based on a property
const foundBooks = await bookRepo.getMany([{field: "bookName", operation: "==", value: "NEW_BOOK_NAME"}])

// batch delete books based on their IDs
await bookRepo.batchDelete(foundBooks.map(book => book.id))
```

# Documentation

## `constructor(firestore, collectionName, options)`

Example Usage:
```ts
const repo = new FirestoreCrudRepository<BookEntity>(
  firestoreInstance,
  COLLECTION_NAME,
  {
    idGenerator: (create) => someIdGenerationFunction(create),
    opStatHandler: (stat) => someFirestoreOperationLoggingFunction(stat)
  }
)
```

Creates an instance of `FirebaseCrudRepository`.

It requires an instance of `Firestore` to be passed in, this should be initialised in whatever manner you are using
for working with Firestore in your application.

It requires a `collectionName` parameter, this is a `string`. This is the name of the collection in Firestore in which your data will be stored.

It takes an optional `options` parameter. This provides mechanisms for overriding the default behaviour of the repository.

### `FirestoreOptions<T>`

The options for configuring how `FirestoreCrudRepository` behaves.

It has the following definition:

```ts
interface FirestoreOptions<T> {
  idGenerator?:(create:Create<T>) => string,
  opStatHandler?:(stats:RepositoryOperationStats) => void,
}
```

The `idGenerator` is a function that will receive entities just before they are created, it returns a string.
That string will be used as a the ID for the new entity when it is created in Firestore.

By default, IDs will be created as v4 UUIDs.

The `opStatHandler` is a function that is invoked each time a Read/Write/Delete is performed by the `FirestoreCrudRepository`.
This is used for keeping track of how many chargeable operations have been performed by Firestore.
They can be logged and tagged to a specific request to help find which requests are causing the majority of chargeable operations in your application.

Note: Both Creates & Updates are counted as "Writes" by Firestore, it does not differentiate between them.

The function is passed an instance of `RepositoryOperationStats`, which has the following definition:
```ts
export interface RepositoryOperationStats {
  collectionName:string,
  numberOfReads?:number,
  numberOfWrites?:number,
  numberOfDeletes?:number,
}
```

The function does nothing by default.

## Create Only: `async createOnly(create:Create<T>):Promise<string>`

Example Usage:
```ts
const entityToCreate:Create<SomeInterface> = {
  entityProperty1: "Some value",
  entityProperty2: "Some other value"
}

const id = await repo.createOnly(entityToCreate)
```

Creates an instance of an entity in Firestore.
It does not return the newly created entity, only the ID that was generated for the entity.

This method exists alongside `createAndReturn` to give callers the option to decide if they need the new entity or not.
Returning a new Entity each time it is created incurs an extra Read operation alongside the Write operation, 
using `createOnly` will only incur the Write operation.

New Entities will have `createdAt` set on them to be the time at which the entity was created.
This property is only set on creation and never updated by the `FirestoreCrudRepository`.

New Entities will have `updatedAt` set on them to be the time at which the entity was created.
This property will be updated by the `FirestoreCrudRepository` each time it updates the entity.

## Create and Return: `async createAndReturn(create:Create<T>):Promise<T>`

Example Usage:
```ts
const entityToCreate:Create<SomeInterface> = {
  entityProperty1: "Some value",
  entityProperty2: "Some other value"
}

const newEntity = await repo.createAndReturn(entityToCreate)
```

Creates an instance of an entity in Firestore and return that newly created entity.

Creating and Returning will incur both a Write and a Read operation in Firestore, 
if the Read is not required, the `createOnly` method can be used to only perform the Write.

New Entities will have `createdAt` set on them to be the time at which the entity was created.
This property is only set on creation and never updated by the `FirestoreCrudRepository`.

New Entities will have `updatedAt` set on them to be the time at which the entity was created.
This property will be updated by the `FirestoreCrudRepository` each time it updates the entity.


## Batch Create: `async batchCreate(creates:Array<Create<T>>, options?:{batchSize?:number}):Promise<Array<string>>`

Example Usage:
```ts
const entityToCreate1:Create<SomeInterface> = {
  entityProperty1: "Some value",
  entityProperty2: "Some other value"
}
const entityToCreate2:Create<SomeInterface> = {
  entityProperty1: "Some value",
  entityProperty2: "Some other value"
}

const newIds = await repo.batchCreate(
  [
    entityToCreate1,
    entityToCreate2
  ],
  { batchSize: 2 }
)
```

Creates several instances of an entity in batches in Firestore.
It returns an array containing the IDs of the newly created entities.

All entities in a single batch will be saved in a single transaction.

The batch size can be configured by setting the `batchSize` property on the optional `options` parameter.

By default, the batch size is 500, this is the largest size Firestore allows a single transaction of entities to be when saving them.

New Entities will have `createdAt` set on them to be the time at which the entity was created.
This property is only set on creation and never updated by the `FirestoreCrudRepository`.

New Entities will have `updatedAt` set on them to be the time at which the entity was created.
This property will be updated by the `FirestoreCrudRepository` each time it updates the entity.


## Get One: `async getOne(id:string):Promise<T|null>`

Example Usage:
```ts
const id = "SOME_ENTITY_ID"
const entity = await repo.getOne(id)
```

Gets a single Entity based on it's ID. 
It will return null if there was no entity associated with the ID.

## Get Many By Id: `async getManyById(ids:Array<string>):Promise<Array<T>>`

Example Usage:
```ts
const ids = [
  "SOME_ENTITY_ID",
  "SOME_OTHER_ENTITY_ID",
]
const entities = await repo.getManyById(ids)
```

Gets multiple entities based on their IDs, returns an Array of those retrieved entities.
Will return an empty list if no IDs matched an entity.

This method operates by batching the input IDs into batches of 10,
and then running multiple queries for 10 entities concurrently.

Each individual query is using a batch size of 10 because this is a the largest size allowed by Firestore in it's `in` clause.

## Get Many: `async getMany(queries:Array<Query<T>>, queryOptions:QueryOptions<T>|null = null):Promise<Array<T>>`

Example Usage
```ts
// find all the entities that:
// have "someField" equal to "SOME_VALUE"
// AND  "someOtherField" greater than or equal to 22
// sorted by "someOtherField" in Ascending order
// limited to the first 5 results
const entities = await repo.getMany(
  [
    {field: "someField", operation: "==", value: "SOME_VALUE"},
    {field: "someOtherField", operation: ">=", value: 22}
  ],
  {
    sort: [{field: "someOtherField", order: SortOrder.ASC}],
    limit: 5
  }
)
```

Gets entities based on some queries, return them as an Array.
If no entities are matched by the queries, it will return an empty Array.

There are 2 parameters to the function:
 - `queries` - Required - An Array of `Query<T>` objects, these determine the selection criteria for matching entities. Can be an empty Array to match all.
 - `queryOptions` - Optional - An object that determines how the entities are returned, provides configuration for sorting entities / limiting entities / starting from a particular entity

The `Query<T>` object has the following definition:
```ts
export interface Query<T> {
  field:Extract<keyof T, string>|string,
  operation:WhereFilterOp,
  value:any,
}
```
The `field` will usually be a property from the entity, so it will have type hints when used in an IDE that supports them.
It is also allowed to be any string for matching deeply nested fields or edge cases.

The `operation` is the `WhereFilterOp` defined by `Firestore`, it has the following definition:
```ts
export type WhereFilterOp =
    | '<'
    | '<='
    | '=='
    | '!='
    | '>='
    | '>'
    | 'array-contains'
    | 'in'
    | 'not-in'
    | 'array-contains-any';
```
These are the operations that can be performed in Firestore when querying for an entity.

The `value` field is intentionally left as `any` to allow the user to query based on any value that is relevant to their use case.


The `QueryOptions<T>` has the following definition:
```ts
export interface QueryOptions<T> {
  limit?:number,
  sort?:Array<Sort<T>>,
  startAfterId?:string,
  startAtId?:string,
}
```

The `limit` option specifies the maximum number of results to return from the query, by default there is no limit.
If you attempt to query for the entirety of a large collection, you will probably find the query hangs and then times out.
The recommended approach to querying for large numbers of entities is to use the `CollectionIterator<T>` exposed by the `iterator()` method.

The `startAfterId` option allows the caller to specify the ID, after which, results should be returned.
This is the recommended way to perform paging on Firestore, using `offset` leads to many unused Read operations.
It will not include results with the ID specified.

The `startAtId` option allows the caller to specify the ID, after which, results should be returned.
This is the recommended way to perform paging on Firestore, using `offset` leads to many unused Read operations.
It will include results with the ID specified.

The `sort` option allows the caller to specify the order in which results should be returned.
It takes an Array of `Sort<T>` objects.
Each `Sort<T>` object is a new sort that will be added together to be able to create sorts across multiple fields in multiple directions.

The `Sort<T>` object has the following definition:
```ts
export interface Sort<T> {
  field:Extract<keyof T, string>|string,
  order:SortOrder,
}
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}
```
The `field` will usually be a property from the entity, so it will have type hints when used in an IDE that supports them.
It is also allowed to be any string for matching deeply nested fields or edge cases.

The `order` field specifies the Sort Order, it should be `asc` for Ascending or `desc` for Descending.

Example Usage:
```ts
// Create a sort that will:
// Order by fieldA Ascending THEN by fieldB Descending THEN by fieldC Ascending
const multipleSort = [
  {field: "fieldA", order: SortOrder.ASC},
  {field: "fieldB", order: SortOrder.DESC},
  {field: "fieldC", order: SortOrder.ASC},
]
```

## Update Only: `async updateOnly(id:string, value:Update<T>):Promise<string|null>`

Example Usage:
```ts
const entityId = await repo.createOnly({ 
  someProperty1: "SOME_VALUE_1", 
  someProperty2: "SOME_VALUE_2", 
  someProperty3: "SOME_VALUE_3",  
})

const theSameEntityId = await repo.updateOnly(entityId, {
  someProperty2: "SOME_DIFFERENT_VALUE_2",
  someProperty3: "SOME_DIFFERENT_VALUE_3",
})
```

Updates a single entity based on the properties passed in.
Properties on the input object will overwrite properties on the object saved in Firestore.

It returns the ID of the updated entity, but does not return the updated entity itself.
This is so that this operation is only a single Write and a single Read.
One Read to check for the existence of the entity, one Write to update the entity.
If an update followed by returning the updated entity is required, use the `updateAndReturn()` method.

If an empty object is given, the only field that will be updated is the `updatedAt` field.

If there is no entity that matches the input ID, it will not update anything and will return null.

Whenever this method is used for an existing entity, the `updatedAt` field will also be updated to the current time.

If the entity being updated has nested objects, and a call is made to update the root object, the nested object will be replaced.
If the caller needs to merge fields of nested objects, use the `mergeOnly()` method.

For example:
```ts
const id = await repo.createOnly({
  someProperty: "SOME_VALUE",
  someObjectProperty: {
    someNestedProperty1: "SOME_NESTED_VALUE_1",
    someNestedProperty2: "SOME_NESTED_VALUE_2"
  }
})

// this will remove someNestedProperty1 and someNestedProperty2 from someObjectProperty
// and replace someObjectProperty with {someNestedProperty3: "SOME_NESTED_VALUE_3"}
// if you wanted to add someNestedProperty3 to someObjectProperty, use the mergeOnly() method
await repo.updateOnly(
  id,
  {
    someObjectProperty: {someNestedProperty3: "SOME_NESTED_VALUE_3"}
  }
)

const updatedEntity = await repo.getOne(id)
/* updatedEntity:
{
  someProperty: "SOME_VALUE",
  someObjectProperty: {
    someNestedProperty3: "SOME_NESTED_VALUE_3"
  }
}
 */
```

## Update One and Return: `async updateOneAndReturn(id:string, value:Update<T>):Promise<T|null>`

Example Usage:
```ts
const entityId = await repo.createOnly({ 
  someProperty1: "SOME_VALUE_1", 
  someProperty2: "SOME_VALUE_2", 
  someProperty3: "SOME_VALUE_3",  
})

const theUpdatedEntity = await repo.updateOneAndReturn(entityId, {
  someProperty2: "SOME_DIFFERENT_VALUE_2",
  someProperty3: "SOME_DIFFERENT_VALUE_3",
})
```

Updates a single entity and then returns the updated entity.

This will incur both a Write and 2 Read operations in Firestore. 
One Read to check for the existence of the entity, one Write to update the entity, one Read to return the updated entity.

The way the update operates is identical to the `updateOnly()` method, see the above documentation for how it operates. 

## Update Only in Transaction `async updateOnlyInTransaction(id:string, value:Update<T>):Promise<string>`

Example Usage:
```ts
const entityId = await repo.createOnly({ 
  someProperty1: "SOME_VALUE_1", 
  someProperty2: "SOME_VALUE_2", 
  someProperty3: "SOME_VALUE_3",  
})

const theSameEntityId = await repo.updateOnlyInTransaction(entityId, {
  someProperty2: "SOME_DIFFERENT_VALUE_2",
  someProperty3: "SOME_DIFFERENT_VALUE_3",
})
```

At a high level, performs the same operation as the `updateOnly()` method.
It will perform a Read to check to see if the entity exists, then perform a Write to update the entity.

The key difference is that, this method will reattempt the update if it detects that the entity was updated by
another process in-between the Read and the Update.

This method is recommended if you have a collection or entities that are being rapidly updated by many different 
processes and it is important that consistency is high between those updates.

Aside from the transactional nature of this method and it's retry mechanism, it behaves in the same way
as the `updateOnly()` method.

## Merge Only: `async mergeOnly(id:string, value:Update<T>):Promise<string|null>`

Example Usage:
```ts
const id = await repo.createOnly({
  someProperty: "SOME_VALUE",
  someObjectProperty: {
    someNestedProperty1: "SOME_NESTED_VALUE_1",
    someNestedProperty2: "SOME_NESTED_VALUE_2"
  }
})

await repo.mergeOnly(
  id,
  {
    someObjectProperty: {someNestedProperty3: "SOME_NESTED_VALUE_3"}
  }
)

const updatedEntity = await repo.getOne(id)
/* updatedEntity:
{
  someProperty: "SOME_VALUE",
  someObjectProperty: {
    someNestedProperty1: "SOME_NESTED_VALUE_1",
    someNestedProperty2: "SOME_NESTED_VALUE_2",
    someNestedProperty3: "SOME_NESTED_VALUE_3"
  }
}
 */
```

Merges the properties in the update object to the entity with the specified ID.

Generally useful for applying partial updates to nested objects without the need to replace the whole object.

It returns the ID of the updated entity, but does not return the updated entity itself.
This is so that this operation is only a single Write and a single Read.
One Read to check for the existence of the entity, one Write to update the entity.

If an empty object is given, the only field that will be updated is the `updatedAt` field.

If there is no entity that matches the input ID, it will not update anything and will return null.

Whenever this method is used for an existing entity, the `updatedAt` field will also be updated to the current time.

## Batch Update: `async batchUpdate(updates:Array<BatchUpdate<T>>, options?:{batchSize?:number}):Promise<number>`

Example Usage:
```ts
const entityId1 = await repo.createOnly({ someProperty: "SOME_VALUE" })
const entityId2 = await repo.createOnly({ someProperty: "SOME_VALUE" })
const entityId3 = await repo.createOnly({ someProperty: "SOME_VALUE" })

const idsOfUpdatedEntities = await repo.batchUpdate(
  [
    {id: entityId1, update: {someProperty: "SOME_NEW_VALUE"}},
    {id: entityId2, update: {someProperty: "SOME_NEW_VALUE"}},
    {id: entityId3, update: {someProperty: "SOME_NEW_VALUE"}},
  ]
)
```

Updates multiple entities in batch and returns the IDs of the updated entities.

Takes a number of updates to be applied to entities, batches them, then runs all the update batches concurrently.

The batch size is set to 500 by default as this is the maximum allowed batch size in Firestore.
It can be configured by setting the `batchSize` property on the optional `options` parameter to the method.

Updates are applied in a manner that is consistent with the behaviour in the `updateOnly()` method.

Each entity that is updated will also update the `updatedAt` field on those entities to be the current time.


## Delete: `async delete(id:string):Promise<boolean>`

Example Usage:
```ts
const id = await repo.createOnly({ someProperty: "SOME_VALUE" })

await repo.delete(id)
```

Attempts to delete an entity based on an input ID.
Returns a boolean, true if the entity was deleted, false if the entity could not be found.


## Batch Delete: `async batchDelete(ids:Array<string>):Promise<number>`

Example Usage:
```ts
const id1 = await repo.createOnly({ someProperty: "SOME_VALUE" })
const id2 = await repo.createOnly({ someProperty: "SOME_VALUE" })
const id3 = await repo.createOnly({ someProperty: "SOME_VALUE" })

const numberOfDeletedEntities = await repo.batchDelete([id1, id2, id3])
```

Deletes multiple entities, by id, in batch and return the number of entities that were deleted.

The Batch size is 500 as this is the max allowed batch siz allowed by Firestore.


## Iterator: `iterator()`

Example Usage:
```ts
await repo.iterator()
  .queries([
    {field: "someField", operation: "==", value: "SOME_VALUE"},
  ])
  .batchSize(100)
  .sort([{field: "someField", order: SortOrder.ASC}])
  .iterate(async (entity) => {
    // ... do something with the entity
  })
```

Returns a `CollectionIterator<T>` that can be configured and then used to iterate over a large number of
entities that are returned from the queries.

This is intended to be used in situations where a large (more than 500) number of entities need to be 
retrieved from Firestore and processed in a way that does not require loading all of the entities into 
memory at the same time.

It can be useful for situations where large numbers of entities need to be updated or for creating aggregate
entities, the caller can iterate through entities, performing updates or calculating stats and keep the memory usage constant.

## Collection Iterator: `CollectionIterator<T>`

The `CollectionIterator<T>` follows a builder pattern and allows the caller to configure how the iteration 
will be performed before calling either `iterate()` or `iterateBatch()` to begin the iteration.

### Queries: `queries(queries:Array<Query<T>>):CollectionIterator<T>`

The `queries()` method takes an Array of `Query<T>` objects. These are identical to the query objects used
by the `getMany()` function. 
They have a `field`, `operation` and `value` property and are used to build a single where query for selecting entities. 
Queries are all ANDed together.

The method returns the instance of `CollectionIterator<T>` to allow for further configuration.

### Batch Size: `batchSize(batchSize:number):CollectionIterator<T>`

The `batchSize()` method takes a number to use as the batch size for pulling entities from Firestore.

By default, it is set to 500. 
This means that the iterator will fetch 500 entities, run the iteration over those 500 entities, then fetch another 500, and so on.

This can be configured to be larger than 500, it is up to the caller to select a batch size that is the most performant 
for their use case and infrastructure.

The method returns the instance of `CollectionIterator<T>` to allow for further configuration.

### Sort: `sort(sort:Array<Sort<T>>):CollectionIterator<T>`

The `sort()` method takes an Array of `Sort<T>` objects.
These are identical to the sort objects used by the `getMany()` function.
They have a `field` and `order` property and are used to build up the ordering of entities for the iterator to process.

The method returns the instance of `CollectionIterator<T>` to allow for further configuration.

### Start After ID: `startAfterId(startAfterId:string|null):CollectionIterator<T>`

The `startAfterId()` method takes an ID or null.
If an ID is provided, this will be the place in the query that the query will start from.
If null is provided, the query will start from the beginning of the results.
This can be useful for starting an iterator from where it left off if it failed or ran out of time.

The method returns the instance of `CollectionIterator<T>` to allow for further configuration.

### Iterate: `async iterate(entityConsumer:(entity:T) => Promise<boolean|void>, errorHandler?: (error:any, entity:T) => void):Promise<IteratorResult>`

The `iterate()` method takes an entity consumer function.
This will be called for every entity the iterator processes.
The iterator functions by reading a batch of results and then calling the entity consumer on every entity in the batch concurrently.
If it is required to process entities in a batch in a particular way, it is recommended to use the `iterateBatch()` method and handle it directly.

The iterate method returns either `void` or a `boolean`.
In the case of `void`, the iterator will continue until there are no more results.
In the case of `boolean`, the iterator will continue until one of the entity consumers returns `true`.
This is the indication to the iterator that it needs to perform an early exit.

The early exit functionality is intended to give callers to terminate iteration at the point where they 
have finished processing the entities.

The `iterate()` method also takes an error handler function.
This will be called if an error occurs while processing the iterate function for an entity.
If this handler does not throw an error, processing of entities will continue.
If no error handler is specified, the error will be thrown and the iterator will stop.

The error handler is intended to give callers an opportunity to log errors and then decide if they want to 
continue iterating through entities.

The `iterate()` method returns an instance of `IteratorResult`.
This has the following definition:
```ts
interface IteratorResult {
  totalNumberOfResults: number,
  lastProcessedId:string|null,
  finished:boolean,
}
```

The `totalNumberOfResults` is the total number of entities the iterator managed to process.

The `lastProcessedId` is the ID of the last entity that was processed. 
This can be saved and used for a follow invocation of the iterator to start from where it left off.

The `finished` communicates whether the iterator got to the end of it's results.








