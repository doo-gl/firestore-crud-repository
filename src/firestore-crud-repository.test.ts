import {BatchUpdate, Create, Entity, FirestoreCrudRepository, RepositoryOperationStats, SortOrder} from "./index";
import {uuid} from "./uuid";
import flatten from "lodash.flatten";
import {Firestore} from "@google-cloud/firestore";

let firestore:Firestore|null = null

export const getFirestoreForTesting = () => {
  if (!firestore) {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8144"
    firestore = new Firestore();
  }
  return firestore
}

interface HelloWorld extends Entity {
  greeting:string,
}

const sleep = async (millis:number) => {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), millis)
  })
}

const COLLECTION_NAME = "hello_world"

describe("FirestoreCrudRepository", () => {

  let repo:FirestoreCrudRepository<HelloWorld>
  let opStats:RepositoryOperationStats = {
    collectionName: COLLECTION_NAME,
    numberOfWrites: 0,
    numberOfReads: 0,
    numberOfDeletes: 0,
  }

  beforeAll(() => {
    repo = new FirestoreCrudRepository<HelloWorld>(
      getFirestoreForTesting(),
      COLLECTION_NAME,
      {
        opStatHandler: stats => {
          opStats.numberOfWrites = (opStats.numberOfWrites ?? 0) + (stats.numberOfWrites ?? 0)
          opStats.numberOfReads = (opStats.numberOfReads ?? 0) + (stats.numberOfReads ?? 0)
          opStats.numberOfDeletes = (opStats.numberOfDeletes ?? 0) + (stats.numberOfDeletes ?? 0)
        }
      }
    )
  })

  beforeEach(async () => {
    const allEntities = await repo.getMany([])
    await repo.batchDelete(allEntities.map(ent => ent.id))
    opStats = {
      collectionName: COLLECTION_NAME,
      numberOfWrites: 0,
      numberOfReads: 0,
      numberOfDeletes: 0,
    }
  })

  describe("createOnly", () => {
    it("Should create a document", async () => {
      const expectedGreeting = "hello"
      const id = await repo.createOnly({
        greeting: expectedGreeting,
      })
      const entity = await repo.getOne(id)

      expect(entity).not.toBeNull()
      expect(entity?.greeting).toBe(expectedGreeting)

      expect(opStats.numberOfWrites).toBe(1)
      expect(opStats.numberOfReads).toBe(1)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("createAndReturn", () => {
    it("Should create a document", async () => {
      const expectedGreeting = "hello"
      const entity = await repo.createAndReturn({
        greeting: expectedGreeting,
      })

      expect(entity).not.toBeNull()
      expect(entity?.greeting).toBe(expectedGreeting)

      expect(opStats.numberOfWrites).toBe(1)
      expect(opStats.numberOfReads).toBe(1)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("getOne", () => {
    it("Should get one document", async () => {
      const expectedGreeting = "hello"
      const id = await repo.createOnly({
        greeting: expectedGreeting,
      })
      const entity = await repo.getOne(id)

      expect(entity).not.toBeNull()
      expect(entity?.greeting).toBe(expectedGreeting)

      expect(opStats.numberOfWrites).toBe(1)
      expect(opStats.numberOfReads).toBe(1)
      expect(opStats.numberOfDeletes).toBe(0)
    })

    it("Should return null if entity is missing", async () => {
      const entity = await repo.getOne(uuid())

      expect(entity).toBeNull()

      expect(opStats.numberOfWrites).toBe(0)
      expect(opStats.numberOfReads).toBe(1)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("batchCreate", () => {
    it("Should create multiple entities", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
      ]

      const ids = await repo.batchCreate(creates)
      const entities = await repo.getManyById(ids)

      expect(entities.length).toBe(3)
      expect(entities.filter(ent => ent.greeting === creates[0].greeting).length).toBe(1)
      expect(entities.filter(ent => ent.greeting === creates[1].greeting).length).toBe(1)
      expect(entities.filter(ent => ent.greeting === creates[2].greeting).length).toBe(1)

      expect(opStats.numberOfWrites).toBe(3)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("getMany", () => {
    it("Should get all if no query provided", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
      ]

      const ids = await repo.batchCreate(creates)
      const entities = await repo.getMany([])

      expect(entities.length).toBe(3)
      expect(entities.filter(ent => ent.greeting === creates[0].greeting).length).toBe(1)
      expect(entities.filter(ent => ent.greeting === creates[1].greeting).length).toBe(1)
      expect(entities.filter(ent => ent.greeting === creates[2].greeting).length).toBe(1)

      expect(opStats.numberOfWrites).toBe(3)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(0)
    })

    it("Should return only selected entities when querying with ==", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello1"},
        {greeting: "hello2"},
      ]

      const ids = await repo.batchCreate(creates)
      const entities = await repo.getMany(
        [{field: "greeting", operation: "==", value: "hello2"}]
      )

      expect(entities.length).toBe(1)
      expect(entities.filter(ent => ent.greeting === "hello2").length).toBe(1)

      expect(opStats.numberOfWrites).toBe(3)
      expect(opStats.numberOfReads).toBe(1)
      expect(opStats.numberOfDeletes).toBe(0)
    })


  })

  describe("getManyById", () => {
    it("Should return multiple entities by id", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
      ]

      const ids = await repo.batchCreate(creates)
      const entities = await repo.getManyById(ids)

      expect(entities.length).toBe(3)
      expect(entities.filter(ent => ent.greeting === creates[0].greeting).length).toBe(1)
      expect(entities.filter(ent => ent.greeting === creates[1].greeting).length).toBe(1)
      expect(entities.filter(ent => ent.greeting === creates[2].greeting).length).toBe(1)

      expect(opStats.numberOfWrites).toBe(3)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("updateOnly", () => {
    it("Should update entity", async () => {
      const entity = await repo.createAndReturn({
        greeting: "hello1"
      })
      expect(entity.greeting).toBe("hello1")
      await sleep(1)
      const updatedEntityId = await repo.updateOnly(entity.id, {greeting: "hello2"})
      expect(updatedEntityId).not.toBeNull()
      const updatedEntity = await repo.getOne(updatedEntityId!)
      expect(updatedEntity?.greeting).toBe("hello2")
      expect(updatedEntity?.updatedAt?.toMillis()).toBeGreaterThan(entity.updatedAt.toMillis())

      expect(opStats.numberOfWrites).toBe(2)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("updateOneAndReturn", () => {
    it("Should update entity and return updated entity", async () => {
      const entity = await repo.createAndReturn({
        greeting: "hello1"
      })
      expect(entity.greeting).toBe("hello1")
      await sleep(1)
      const updatedEntity = await repo.updateOneAndReturn(entity.id, {greeting: "hello2"})
      expect(updatedEntity).not.toBeNull()
      expect(updatedEntity?.greeting).toBe("hello2")
      expect(updatedEntity?.updatedAt?.toMillis()).toBeGreaterThan(entity.updatedAt.toMillis())

      expect(opStats.numberOfWrites).toBe(2)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("updateOnlyInTransaction", () => {
    it("Should Update entity", async () => {
      const entity = await repo.createAndReturn({
        greeting: "hello1"
      })
      expect(entity.greeting).toBe("hello1")
      await sleep(1)
      const updatedEntityId = await repo.updateOnlyInTransaction(entity.id, {greeting: "hello2"})
      expect(updatedEntityId).not.toBeNull()
      const updatedEntity = await repo.getOne(updatedEntityId!)
      expect(updatedEntity?.greeting).toBe("hello2")
      expect(updatedEntity?.updatedAt?.toMillis()).toBeGreaterThan(entity.updatedAt.toMillis())

      expect(opStats.numberOfWrites).toBe(2)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("mergeOnly", () => {
    it("Should merge details to object", async () => {
      const create:any = {
        greeting: "hello1",
        subObject: {att1: "att1"}
      }
      const entity = await repo.createAndReturn(create)
      expect(entity.greeting).toBe("hello1")
      await sleep(1)
      const update:any = {greeting: "hello2", subObject: {att2: "att2"}}
      const updatedEntityId = await repo.mergeOnly(entity.id, update)
      expect(updatedEntityId).not.toBeNull()
      const updatedEntity:any = await repo.getOne(updatedEntityId!)
      expect(updatedEntity?.greeting).toBe("hello2")
      expect(updatedEntity?.subObject?.att1).toBe("att1")
      expect(updatedEntity?.subObject?.att2).toBe("att2")
      expect(updatedEntity?.updatedAt?.toMillis()).toBeGreaterThan(entity.updatedAt.toMillis())

      expect(opStats.numberOfWrites).toBe(2)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("batchUpdate", () => {
    it("Should update multiple documents", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
      ]

      const ids = await repo.batchCreate(creates)

      const updates:Array<BatchUpdate<HelloWorld>> = [
        {id: ids[0], update: {greeting: "greeting1"}},
        {id: ids[1], update: {greeting: "greeting2"}},
        {id: ids[2], update: {greeting: "greeting3"}}
      ]
      await repo.batchUpdate(updates)
      const entities = await repo.getManyById(ids)

      expect(entities.length).toBe(3)
      expect(entities.filter(ent => ent.greeting === "greeting1").length).toBe(1)
      expect(entities.filter(ent => ent.greeting === "greeting2").length).toBe(1)
      expect(entities.filter(ent => ent.greeting === "greeting3").length).toBe(1)

      expect(opStats.numberOfWrites).toBe(6)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

  describe("delete", () => {
    it("Should delete an entity", async () => {
      const id = await repo.createOnly({
        greeting: "hello1"
      })
      const preDelete = await repo.getOne(id)
      expect(preDelete).not.toBeNull()
      await repo.delete(id)
      const postDelete = await repo.getOne(id)
      expect(postDelete).toBeNull()

      expect(opStats.numberOfWrites).toBe(1)
      expect(opStats.numberOfReads).toBe(3)
      expect(opStats.numberOfDeletes).toBe(1)
    })
  })

  describe("batchDelete", () => {
    it("Should delete multiple entities", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
      ]

      const ids = await repo.batchCreate(creates)
      const preDelete = await repo.getManyById(ids)
      expect(preDelete.length).toBe(3)
      await repo.batchDelete(ids)
      const postDelete = await repo.getManyById(ids)
      expect(postDelete.length).toBe(0)

      expect(opStats.numberOfWrites).toBe(3)
      expect(opStats.numberOfReads).toBe(4)
      expect(opStats.numberOfDeletes).toBe(3)
    })
  })

  describe("iterator", () => {
    it("Should iterate through all entities", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
        {greeting: "hello4"},
      ]

      await repo.batchCreate(creates)
      const entities = new Array<HelloWorld>()
      await repo.iterator()
        .batchSize(1)
        .iterate(async entity => {
          entities.push(entity)
        })

      expect(entities.length).toBe(4)
      expect(entities.filter(ent => ent.greeting === "hello1").length).toBe(1)
      expect(entities.filter(ent => ent.greeting === "hello2").length).toBe(1)
      expect(entities.filter(ent => ent.greeting === "hello3").length).toBe(1)
      expect(entities.filter(ent => ent.greeting === "hello4").length).toBe(1)

      expect(opStats.numberOfWrites).toBe(4)
      expect(opStats.numberOfReads).toBe(5)
      expect(opStats.numberOfDeletes).toBe(0)
    })

    it("Should iterate in batches", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
        {greeting: "hello4"},
      ]

      await repo.batchCreate(creates)
      const entities = new Array<Array<HelloWorld>>()
      await repo.iterator()
        .batchSize(2)
        .iterateBatch(async entityBatch => {
          entities.push(entityBatch)
        })

      expect(entities.length).toBe(2)
      expect(entities[0].length).toBe(2)
      expect(entities[1].length).toBe(2)
      const flatEntities = flatten(entities)
      expect(flatEntities.filter(ent => ent.greeting === "hello1").length).toBe(1)
      expect(flatEntities.filter(ent => ent.greeting === "hello2").length).toBe(1)
      expect(flatEntities.filter(ent => ent.greeting === "hello3").length).toBe(1)
      expect(flatEntities.filter(ent => ent.greeting === "hello4").length).toBe(1)

      expect(opStats.numberOfWrites).toBe(4)
      expect(opStats.numberOfReads).toBe(5)
      expect(opStats.numberOfDeletes).toBe(0)
    })

    it("Should filter by queries", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
        {greeting: "hello4"},
      ]

      await repo.batchCreate(creates)
      const entities = new Array<HelloWorld>()
      await repo.iterator()
        .batchSize(1)
        .queries([{field: "greeting", operation: "==", value: "hello2"}])
        .iterate(async entity => {
          entities.push(entity)
        })

      expect(entities.length).toBe(1)
      expect(entities.filter(ent => ent.greeting === "hello2").length).toBe(1)

      expect(opStats.numberOfWrites).toBe(4)
      expect(opStats.numberOfReads).toBe(2)
      expect(opStats.numberOfDeletes).toBe(0)
    })

    it("Should sort if requested", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
        {greeting: "hello4"},
      ]

      await repo.batchCreate(creates)
      const entities = new Array<HelloWorld>()
      await repo.iterator()
        .batchSize(1)
        .sort([{field: "greeting", order: SortOrder.ASC}])
        .iterate(async entity => {
          entities.push(entity)
        })

      expect(entities.length).toBe(4)
      expect(entities[0].greeting).toBe("hello1")
      expect(entities[1].greeting).toBe("hello2")
      expect(entities[2].greeting).toBe("hello3")
      expect(entities[3].greeting).toBe("hello4")

      expect(opStats.numberOfWrites).toBe(4)
      expect(opStats.numberOfReads).toBe(5)
      expect(opStats.numberOfDeletes).toBe(0)
    })

    it("Should start after selected id", async () => {
      const creates:Array<Create<HelloWorld>> = [
        {greeting: "hello1"},
        {greeting: "hello2"},
        {greeting: "hello3"},
        {greeting: "hello4"},
      ]

      const ids = await repo.batchCreate(creates)
      const sortedIds = ids.slice().sort()
      const entities = new Array<HelloWorld>()
      await repo.iterator()
        .batchSize(1)
        .startAfterId(sortedIds[2])
        .iterate(async entity => {
          entities.push(entity)
        })

      expect(entities.length).toBe(1)
      expect(entities[0].id).toBe(sortedIds[3])

      expect(opStats.numberOfWrites).toBe(4)
      expect(opStats.numberOfReads).toBe(2)
      expect(opStats.numberOfDeletes).toBe(0)
    })
  })

})