import {CollectionReference, FieldValue, Firestore, Timestamp, WhereFilterOp} from "@google-cloud/firestore";
import {uuid} from "./uuid";
import {promiseChainExecutor} from "promise-chain-executor";
import chunk from "lodash.chunk";
import flatten from "lodash.flatten"

export type Create<T> = Omit<T, keyof Entity>
export type Update<T> = Partial<Omit<T, keyof Entity>>

export interface BatchUpdate<T extends Entity> {
  id:string,
  update:Update<T>|object
}

export interface Entity {
  id:string,
  createdAt:Timestamp,
  updatedAt:Timestamp,
}

export interface RepositoryOperationStats {
  collectionName:string,
  numberOfReads?:number,
  numberOfWrites?:number,
  numberOfDeletes?:number,
}

export interface FirestoreOptions<T> {
  idGenerator?:(create:Create<T>) => string,
  opStatHandler?:(stats:RepositoryOperationStats) => void,
}

export const DEFAULT_ID_GENERATOR = <T>(create:Create<T>):string => uuid()
export const MAX_ALLOWED_IN_IN_CLAUSE = 10;
export const BATCH_SIZE = 500;

export interface Query<T> {
  field:Extract<keyof T, string>|string,
  operation:WhereFilterOp,
  value:any,
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export interface Sort<T> {
  field:Extract<keyof T, string>|string,
  order:SortOrder,
}

export interface QueryOptions<T> {
  limit?:number,
  sort?:Array<Sort<T>>,
  startAfterId?:string,
  startAtId?:string,
}

export class FirestoreCrudRepository<T extends Entity> {

  private readonly collection:CollectionReference<any>;

  constructor(
    private readonly firestore:Firestore,
    private readonly collectionName:string,
    private readonly options?:FirestoreOptions<T>,
  ) {
    this.collection = firestore.collection(collectionName)
  }

  getFirebaseCollection():CollectionReference<any> {
    return this.collection
  }

  private generateId(create:Create<T>):string {
    if (this.options?.idGenerator) {
      return this.options.idGenerator(create)
    }
    return DEFAULT_ID_GENERATOR(create)
  }

  private batchIds(ids:Array<string>):Array<Array<string>> {
    return chunk<string>(ids, MAX_ALLOWED_IN_IN_CLAUSE);
  }

  private onRepoOperation(stat:Omit<RepositoryOperationStats, "collectionName">) {
    if (this.options?.opStatHandler) {
      this.options.opStatHandler({
        collectionName: this.collectionName,
        ...stat
      })
    }
  }

  private mapCreateToEntity(value:Omit<T,keyof Entity>):Entity {
    const id = this.generateId(value);
    const createdAt = FieldValue.serverTimestamp();
    const updatedAt = FieldValue.serverTimestamp();
    // @ts-ignore
    return  {...value, id, createdAt, updatedAt};
  }

  private mapUpdateToEntity(value:Update<T>):Update<Entity> {
    const updatedAt = FieldValue.serverTimestamp();
    // @ts-ignore
    return  {...value, updatedAt};
  }

  async createOnly(create:Create<T>):Promise<string> {
    const entity = this.mapCreateToEntity(create)
    await this.collection.doc(entity.id).set(entity)
    this.onRepoOperation({numberOfWrites: 1})
    return entity.id
  }

  async createAndReturn(create:Create<T>):Promise<T> {
    const id = await this.createOnly(create)
    const newEntity = await this.getOne(id)
    if (!newEntity) {
      throw new Error(`Failed to create new entity in ${this.collectionName}`)
    }
    return newEntity
  }

  async batchCreate(creates:Array<Create<T>>, options?:{batchSize?:number}):Promise<Array<string>> {
    const batchedCreates = chunk(creates, options?.batchSize ?? BATCH_SIZE)
    const ids:Array<string> = []

    const submitBatch = async (createBatch:Array<Create<T>>) => {
      const batch = this.firestore.batch();
      createBatch.forEach(create => {
        const entity = this.mapCreateToEntity(create)
        ids.push(entity.id)
        const docRef = this.collection.doc(entity.id);
        batch.create(docRef, entity);
      });
      const results = await batch.commit();
      this.onRepoOperation({ numberOfWrites: results.length});
    }

    await Promise.all(
      batchedCreates.map(createBatch => submitBatch(createBatch))
    )

    return ids;
  }

  async getOne(id:string):Promise<T|null> {
    const documentSnapshot = await this.collection.doc(id).get()
    this.onRepoOperation({numberOfReads: 1})
    return documentSnapshot.data() ?? null
  }

  async getMany(
    queries:Array<Query<T>>,
    queryOptions:QueryOptions<T>|null = null
  ):Promise<Array<T>> {
    let reference:FirebaseFirestore.Query = this.collection;
    queries.forEach((query:Query<T>) => {
      reference = reference.where(query.field, query.operation, query.value);
    })
    if (queryOptions && queryOptions.sort && queryOptions.sort.length > 0) {
      queryOptions.sort.forEach(sort => {
        reference = reference.orderBy(sort.field, sort.order);
      });
    }
    if (queryOptions && queryOptions.limit) {
      reference = reference.limit(queryOptions.limit);
    }
    if (queryOptions && queryOptions.startAfterId) {
      const startAfterSnapshot = await this.collection.doc(queryOptions.startAfterId).get();
      reference = reference.startAfter(startAfterSnapshot);
    }
    if (queryOptions && queryOptions.startAtId) {
      const endAtSnapshot = await this.collection.doc(queryOptions.startAtId).get();
      reference = reference.startAt(endAtSnapshot);
    }
    const querySnapshot = await reference.get()
    const reads = querySnapshot.size > 0 ? querySnapshot.size : 1; // queries that return 0 results still count as one read.
    this.onRepoOperation({ numberOfReads: reads});
    const documentDatas = querySnapshot.docs.map(snapshot => snapshot.data());
    return <T[]>documentDatas;
  }

  async getManyById(ids:Array<string>):Promise<Array<T>> {
    const idBatches:Array<Array<string>> = this.batchIds(ids)
    const resultBatches:Array<Array<T>> = await Promise.all(
      idBatches.map((idBatch) => this.getMany([{ field: "id", operation: "in", value: idBatch }])),
    );
    const results = flatten(resultBatches);
    return results;
  }

  iterator():CollectionIterator<T> {
    return new CollectionIterator<T>(this);
  }

  async updateOnly(id:string, value:Update<T>):Promise<string|null> {
    const preExistingEntity = await this.getOne(id)
    if (!preExistingEntity) {
      return null
    }
    const updateValue = this.mapUpdateToEntity(value)
    await this.collection.doc(id).update(updateValue)
    this.onRepoOperation({numberOfWrites: 1})
    return id
  }

  async updateOneAndReturn(id:string, value:Update<T>):Promise<T|null> {
    await this.updateOnly(id, value)
    return this.getOne(id);
  }

  async updateOnlyInTransaction(id:string, value:Update<T>):Promise<string> {
    await this.firestore.runTransaction(async transaction => {
      const docRef = this.collection.doc(id)
      const result = await transaction.get(docRef)
      if (!result) {
        return
      }
      this.onRepoOperation({numberOfReads: 1});
      const updateValue = this.mapUpdateToEntity(value)
      await transaction.update(docRef, updateValue)
      this.onRepoOperation({numberOfWrites: 1});
    })

    return id
  }

  async mergeOnly(id:string, value:Update<T>):Promise<string|null> {
    const preExistingEntity = await this.getOne(id)
    if (!preExistingEntity) {
      return null
    }
    const updateValue = this.mapUpdateToEntity(value)
    await this.collection.doc(id).set(updateValue, {merge: true})
    this.onRepoOperation({numberOfWrites: 1})
    return id
  }

  async batchUpdate(updates:Array<BatchUpdate<T>>, options?:{batchSize?:number}):Promise<number> {
    const batchedUpdates = chunk(updates, options?.batchSize ?? BATCH_SIZE)
    let count = 0

    const submitBatch = async (updateBatch:Array<BatchUpdate<T>>) => {
      const batch = this.firestore.batch();
      updateBatch.forEach(update => {
        const docRef = this.collection.doc(update.id);
        const updateValue = this.mapUpdateToEntity(update.update)
        batch.update(docRef, updateValue);
      });
      const results = await batch.commit();
      this.onRepoOperation({numberOfWrites: results.length});
      count += results.length
    }

    await Promise.all(
      batchedUpdates.map(updateBatch => submitBatch(updateBatch))
    )

    return count
  }

  async delete(id:string):Promise<boolean> {
    const entity:T|null = await this.getOne(id);
    if (!entity) {
      return false;
    }
    await this.collection.doc(id).delete();
    this.onRepoOperation({numberOfDeletes: 1});
    return true;
  }

  async batchDelete(ids:Array<string>):Promise<number> {
    const batch = this.firestore.batch();
    ids.forEach(id => {
      const docRef = this.collection.doc(id);
      batch.delete(docRef);
    });
    const results = await batch.commit();
    this.onRepoOperation({numberOfDeletes: results.length});
    return results.length;
  }

}

export interface IteratorResult {
  totalNumberOfResults: number,
  lastProcessedId:string|null,
  finished:boolean,
}

export class CollectionIterator<T extends Entity> {

  private _batchSize = BATCH_SIZE;
  private _sort:Array<Sort<T>> = [];
  private _queries:Array<Query<T>> = [];
  private _startAfterId:string|null = null;

  constructor(
    readonly repo:FirestoreCrudRepository<T>
  ) {}

  queries(queries:Array<Query<T>>):CollectionIterator<T> {
    this._queries = queries;
    return this;
  }

  batchSize(batchSize:number):CollectionIterator<T> {
    this._batchSize = batchSize;
    return this;
  }

  sort(sort:Array<Sort<T>>):CollectionIterator<T> {
    this._sort = sort;
    return this;
  }

  startAfterId(startAfterId:string|null):CollectionIterator<T> {
    this._startAfterId = startAfterId;
    return this;
  }

  async iterateBatch(entityBatchConsumer:(entities:Array<T>) => Promise<boolean|void>):Promise<IteratorResult>  {
    let totalNumberOfResults = 0;
    let lastProcessedId:string|null = null;
    let finished = false;

    const promiseSupplier = async (startProcessingAfterId:string|null):Promise<string|null> => {
      const limit = Math.floor(this._batchSize);
      const queryOptions:QueryOptions<T> = {
        limit,
        sort: this._sort,
      }
      if (startProcessingAfterId || this._startAfterId) {
        // @ts-ignore
        queryOptions.startAfterId = startProcessingAfterId || this._startAfterId;
      }
      const batchOfEntities:Array<T> = await this.repo.getMany(this._queries, queryOptions);
      const lastEntity = batchOfEntities[batchOfEntities.length - 1];
      const nextStartAfterId = batchOfEntities.length < limit ? null : lastEntity.id;
      lastProcessedId = batchOfEntities.length > 0
        ? batchOfEntities[batchOfEntities.length - 1].id
        : lastProcessedId;
      if (!nextStartAfterId) {
        finished = true;
      }
      totalNumberOfResults += batchOfEntities.length;

      if(batchOfEntities.length === 0) {
        return null
      }

      const exit = await entityBatchConsumer(batchOfEntities);

      if (exit) {
        return null;
      }

      return nextStartAfterId;
    }

    await promiseChainExecutor.execute(promiseSupplier)

    return {
      totalNumberOfResults,
      lastProcessedId,
      finished,
    };
  }

  async iterate(
    entityConsumer:(entity:T) => Promise<boolean|void>,
    errorHandler?: (error:any, entity:T) => void,
  ):Promise<IteratorResult> {

    return this.iterateBatch(
      async entities => {
        const shouldExit = new Array<boolean>()
        await Promise.all(entities.map(async entity => {
          try {
            const isExit = await entityConsumer(entity)
            if (!!isExit) {
              shouldExit.push(true)
            }
          } catch (error:any) {
            if (errorHandler) {
              errorHandler(error, entity)
            } else {
              throw error
            }
          }
        }))

        return shouldExit.some(exit => exit);
      }
    )

  }

}




