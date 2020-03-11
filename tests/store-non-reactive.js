const test = require('tape')
const levelup = require('levelup')
const leveldown = require('leveldown')
const encoding = require('encoding-down')
const rimraf = require("rimraf")

const Store = require('../lib/Store.js')

const dbPath = `./test.nr.db`
rimraf.sync(dbPath)
const level = levelup(encoding(leveldown(dbPath), { keyEncoding: 'ascii', valueEncoding: 'json' }))

test("store non-reactive properties", t => {
  t.plan(3)

  let store

  t.test("create store", async t => {
    t.plan(1)
    store = new Store(level)
    t.pass('store created')
  })

  t.test("non reactive operations", async t => {
    t.plan(15)

    t.test("put value", async t => {
      t.plan(1)
      await store.put({ id:'a', v: 1 })
      t.pass('value written')
    })

    t.test("get value", async t => {
      t.plan(1)
      const v = await store.objectGet('a')
      t.deepEqual(v, { v: 1, id: 'a' }, 'value read')
    })


    t.test("put another values", async t => {
      t.plan(1)
      await store.put({ id: 'c', v: 3 })
      await store.put({ id: 'b', v: 2 })
      t.pass('values written')
    })

    t.test("get range [a,c]", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gte: 'a', lte: 'c' })
      t.deepEqual(values, [ { v: 1, id: 'a' }, { v: 2, id: 'b' }, { v: 3, id: 'c' } ], 'range read' )
    })

    t.test("get reverse range [c,a]", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gte: 'a', lte: 'c', reverse: true })
      t.deepEqual(values, [ { v: 3, id: 'c' }, { v: 2, id: 'b' },  { v: 1, id: 'a' } ], 'range read' )
    })

    t.test("get range [a,c] with limit 2", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gte: 'a', lte: 'c', limit: 2 })
      t.deepEqual(values, [ { v: 1, id: 'a' }, { v: 2, id: 'b' } ], 'range read' )
    })

    t.test("get reverse range [c,a] with limit 2", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gte: 'a', lte: 'c', reverse: true, limit: 2 })
      t.deepEqual(values, [ { v: 3, id: 'c' }, { v: 2, id: 'b' } ], 'range read' )
    })

    t.test("get range (a,c]", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gt: 'a', lte: 'c' })
      t.deepEqual(values, [ { v: 2, id: 'b' }, { v: 3, id: 'c' } ], 'range read' )
    })

    t.test("get reverse range [c,a)", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gt: 'a', lte: 'c', reverse: true })
      t.deepEqual(values, [ { v: 3, id: 'c' }, { v: 2, id: 'b' }, ], 'range read' )
    })

    t.test("get range [a,c)", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gte: 'a', lt: 'c' })
      t.deepEqual(values, [ { v: 1, id: 'a' }, { v: 2, id: 'b' } ], 'range read' )
    })

    t.test("get reverse range (c,a]", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gte: 'a', lt: 'c', reverse: true })
      t.deepEqual(values, [ { v: 2, id: 'b' }, { v: 1, id: 'a' } ], 'range read' )
    })

    t.test("get range (a,c)", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gt: 'a', lt: 'c' })
      t.deepEqual(values, [ { v: 2, id: 'b' } ], 'range read' )
    })

    t.test("get reverse range (a,c)", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gt: 'a', lt: 'c', reverse: true })
      t.deepEqual(values, [ { v: 2, id: 'b' } ], 'range read' )
    })

    t.test("remove 'b'", async t => {
      t.plan(1)
      await store.delete('b')
      t.pass("removed")
    })

    t.test("get range [a,c]", async t => {
      t.plan(1)
      let values = await store.rangeGet({ gte: 'a', lte: 'c' })
      t.deepEqual(values, [ { v: 1, id: 'a' }, { v: 3, id: 'c' } ], 'range read' )
    })
  })

  t.test("close and remove database", async t => {
    t.plan(1)
    await level.close()
    rimraf(dbPath, (err) => {
      if(err) return t.fail(err)
      t.pass('removed')
    })
  })
})
