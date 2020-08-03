const IntervalTree = require('@live-change/interval-tree').default
const ReactiveDao = require("@live-change/dao")

class ObjectObservable extends ReactiveDao.ObservableValue {
  constructor(store, key) {
    super()
    this.store = store
    this.key = key

    this.disposed = false
    this.ready = false
    this.respawnId = 0

    this.forward = null

    this.readPromise = this.startReading()
  }

  async startReading() {
    this.store.objectObservables.set(this.key, this)
    this.value = await this.store.objectGet(this.key)
    this.fireObservers('set', this.value)
  }

  async set(value) {
    await this.readPromise
    this.value = value
    this.fireObservers('set', this.value)
  }

  dispose() {
    if(this.forward) {
      this.forward.unobserve(this)
      this.forward = null
      return
    }

    this.disposed = true
    this.respawnId++
    if(this.changesStream) this.changesStream.close()
    this.changesStream = null

    this.store.objectObservables.delete(this.key)
  }

  respawn() {
    const existingObservable = this.store.objectObservables.get(this.key)
    if(existingObservable) {
      this.forward = existingObservable
      this.forward.observe(this)
      return
    }

    this.respawnId++
    if(this.changesStream) this.changesStream.close()
    this.ready = false
    this.disposed = false
    this.startReading()
  }
}

class RangeObservable extends ReactiveDao.ObservableList {
  constructor(store, range) {
    super()
    this.store = store
    this.range = range

    this.disposed = false
    this.ready = false
    this.respawnId = 0
    this.refillId = 0
    this.refillPromise = null

    this.forward = null

    this.rangeKey = JSON.stringify(this.range)
    this.rangeDescr = [ this.range.gt || this.range.gte || '', this.range.lt || this.range.lte || '\xFF\xFF\xFF\xFF' ]

    this.readPromise = this.startReading()
  }

  async startReading() {
    this.store.rangeObservables.set(this.rangeKey, this)
    this.store.rangeObservablesTree.insert(this.rangeDescr, this)
    this.set(await this.store.rangeGet(this.range))
  }

  async putObject(object, oldObject) {
    await this.readPromise
    //console.log("OBSERVABLE PUT OBJECT", object)
    const id = object.id
    if(this.range.gt && !(id > this.range.gt)) return
    if(this.range.lt && !(id < this.range.lt)) return
    if(!this.range.reverse) {
      if(this.range.limit && this.list.length == this.range.limit) {
        for(let i = 0, l = this.list.length; i < l; i++) {
          if(this.list[i].id == id) {
            this.list.splice(i, 1, object)
            this.fireObservers('putByField', 'id', id, object, false, oldObject)
            return
          } else if(this.list[i].id > id) {
            this.list.splice(i, 0, object)
            this.fireObservers('putByField', 'id', id, object, false, oldObject)
            const popped = this.list.pop()
            this.fireObservers('removeByField', 'id', popped.id, popped)
            return
          }
        }
      } else {
        this.putByField('id', object.id, object, false, oldObject)
      }
    } else {
      if(this.range.limit && this.list.length == this.range.limit) {
        for(let i = this.list.length-1; i >= 0; i--) {
          if(this.list[i].id == id) {
            this.list.splice(i, 1, object)
            this.fireObservers('putByField', 'id', id, object, true, oldObject)
            return
          } else if(this.list[i].id > id) {
            this.list.splice(i + 1, 0, object)
            this.fireObservers('putByField', 'id', id, object, true, oldObject)
            const popped = this.list.pop()
            this.fireObservers('removeByField', 'id', popped.id, popped)
            return
          }
        }
        this.list.splice(0, 0, object)
        this.fireObservers('putByField', 'id', id, object, true)
        const popped = this.list.pop()
        this.fireObservers('removeByField', 'id', popped.id, popped)
      } else {
        this.putByField('id', id, object, true, oldObject)
      }
    }
  }

  refillDeleted(from, limit) {
    this.refillId ++
    const refillId = this.refillId
    let promise = (async () => {
      let req
      if(!this.range.reverse) {
        req = { gt: from, limit }
        if(this.range.lt) req.lt = this.range.lt
        if(this.range.lte) req.lte = this.range.lte
      } else {
        req = { lt: from, limit, reverse: true }
        if(this.range.gt) req.gt = this.range.gt
        if(this.range.gte) req.gte = this.range.gte
      }
      const objects = await this.store.rangeGet(req)
      if(this.refillId != refillId) return this.refillPromise
      for(let object of objects) this.push(object)
      this.refillPromise = null
    })()
    this.refillPromise = promise
    return promise
  }

  async deleteObject(object) {
    await this.readPromise
    const id = object.id
    if(this.range.gt && !(id > this.range.gt)) return
    if(this.range.lt && !(id < this.range.lt)) return
    if(this.range.limit && (this.list.length == this.range.limit || this.refillPromise)) {
      let exists
      let last
      for(let obj of this.list) {
        if(obj.id == id) exists = obj
        else last = obj
      }
      this.removeByField('id', id, object)
      if(exists) await this.refillDeleted(
          last && last.id || (this.reverse ? this.range.lt || this.range.lte : this.range.gt || this.range.gte),
          this.range.limit - this.list.length)
    } else {
      this.removeByField('id', id, object)
    }
  }

  dispose() {
    if(this.forward) {
      this.forward.unobserve(this)
      this.forward = null
      return
    }

    this.disposed = true
    this.respawnId++
    this.changesStream = null

    this.store.rangeObservables.delete(this.rangeKey)
    let removed = this.store.rangeObservablesTree.remove(this.rangeDescr, this)
  }

  respawn() {
    const existingObservable = this.store.rangeObservables.get(JSON.stringify(this.range))
    if(existingObservable) {
      this.forward = existingObservable
      this.forward.observe(this)
      return
    }

    this.respawnId++
    this.ready = false
    this.disposed = false
    this.startReading()
  }
}

class Store {
  constructor(level) {
    this.level = level
    this.objectObservables = new Map()
    this.rangeObservables = new Map()
    this.rangeObservablesTree = new IntervalTree()
    this.locks = new Map()
  }

  objectGet(key) {
    return this.level.get(key).catch(err => {
      if(err.name == 'NotFoundError') return null
      throw err
    })
  }

  objectObservable(key) {
    let observable = this.objectObservables.get(key)
    if(observable) return observable
    observable = new ObjectObservable(this, key)
    return observable
  }

  rangeGet(range) {
    return new Promise((resolve, reject) => {
      let data = []
      this.level.createReadStream({ ...range, keys: false, values: true })
        .on('data', function (value) {
          data.push(value)
        })
        .on('error', function (err) {
          reject(err)
        })
        .on('close', function () {
          reject('closed')
        })
        .on('end', function () {
          resolve(data)
        })
    })
  }

  rangeObservable(range) {
    let observable = this.rangeObservables.get(JSON.stringify(range))
    if(observable) return observable
    observable = new RangeObservable(this, range)
    return observable
  }

  async rangeDelete(range) {
    return new Promise((resolve, reject) => {
      let count = 0, last
      this.level.createReadStream({ ...range, keys: false, values: true })
          .on('data', function(value) {
            const id = value.id
            last = id
            this.level.del(id)
            count ++
            const rangeObservables = this.rangeObservablesTree.search([id, id])
            for (const rangeObservable of rangeObservables) {
              rangeObservable.deleteObject(value)
            }
          })
          .on('error', function(err) {
            reject(err)
          })
          .on('close', function() {
            reject('closed')
          })
          .on('end', function() {
            resolve({ count, last })
          })
    })
  }

  async put(object) {
    const id = object.id
    let lock
    while(lock = this.locks.get(object.id)) await lock
    let updateLock = (async ()=> {
      let oldObject = await this.level.get(id).catch(err => {
        if(err.name == 'NotFoundError') return null
        throw err
      })
      if (!id) {
        this.locks.delete(id)
        throw new Error("id must not be empty")
      }
      await this.level.put(id, object)
      const objectObservable = this.objectObservables.get(id)
      if (objectObservable) objectObservable.set(object, oldObject)
      const rangeObservables = this.rangeObservablesTree.search([id, id])
      for (const rangeObservable of rangeObservables) {
        rangeObservable.putObject(object, oldObject)
      }
      this.locks.delete(id)
      return oldObject
    })()
    this.locks.set(id, updateLock)
    return await updateLock
  }

  async delete(id) {
    let deleteLock = (async ()=> {
      let object = await this.level.get(id).catch(err => {
        if(err.name == 'NotFoundError') return null
        throw err
      })
      if(!object) {
        this.locks.delete(id)
        return null
      }
      await this.level.del(id)
      const objectObservable = this.objectObservables.get(id)
      if(objectObservable) objectObservable.set(null)
      const rangeObservables = this.rangeObservablesTree.search([id, id])
      for(const rangeObservable of rangeObservables) {
        rangeObservable.deleteObject(object)
      }
      this.locks.delete(id)
      return object
    })()
    this.locks.set(id, deleteLock)
    const result = await deleteLock
    return result
  }
}

module.exports = Store
