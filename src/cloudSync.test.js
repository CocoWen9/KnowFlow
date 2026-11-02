import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudSync, readDrafts, writeDraft } from './cloudSync.js'

const graph = (title = 'one', version = 1) => ({ id: 'g', version, nodes: [{ id: 'n', data: { title } }], edges: [] })
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('serializes edits and uses the acknowledged version for the next write', async () => {
  const calls = []
  let release
  const sync = new CloudSync({ saveGraph: async (value, options) => {
    calls.push({ value, options })
    if (calls.length === 1) await new Promise((resolve) => { release = resolve })
    return { ...value, version: options.expectedVersion + 1 }
  } }, { uuid: () => `mutation-${calls.length}` })
  sync.seed(graph())
  sync.queue(graph('two'))
  await tick()
  sync.queue(graph('three'))
  sync.queue(graph('four'))
  assert.equal(calls.length, 1)
  release()
  await sync.flush('g')
  assert.deepEqual(calls.map((call) => call.options.expectedVersion), [1, 2])
  assert.equal(calls[1].value.nodes[0].data.title, 'four')
})

test('retries a lost response with the original mutation ID before sending newer edits', async () => {
  const calls = []
  let n = 0
  const sync = new CloudSync({ saveGraph: async (value, options) => {
    calls.push(options)
    if (calls.length === 1) throw new Error('Connection lost')
    return { ...value, version: options.expectedVersion + 1 }
  } }, { uuid: () => String(++n) })
  sync.seed(graph())
  sync.queue(graph('two'))
  await assert.rejects(sync.flush('g'))
  sync.queue(graph('three'))
  sync.retry('g')
  await sync.flush('g')
  assert.deepEqual(calls[0], calls[1])
  assert.equal(calls[2].expectedVersion, 2)
  assert.notEqual(calls[2].mutationId, calls[1].mutationId)
})

test('conflicts stop writes and retain drafts until an explicit resolution', async () => {
  let calls = 0
  const drafts = []
  const sync = new CloudSync({ saveGraph: async () => {
    calls++
    throw Object.assign(new Error('Conflict'), { status: 409 })
  } }, { uuid: () => 'm', onDraft: (id, value) => drafts.push(value) })
  sync.seed(graph())
  sync.queue(graph('two'))
  await assert.rejects(sync.flush('g'))
  sync.queue(graph('three'))
  sync.retry('g')
  await tick()
  assert.equal(calls, 1)
  assert.equal(drafts.at(-1).nodes[0].data.title, 'three')
  assert.ok(drafts.every(Boolean))
})

test('deletion waits for pending writes and blocks later autosaves', async () => {
  const calls = []
  const sync = new CloudSync({
    saveGraph: async (value, { expectedVersion }) => { calls.push('save'); return { ...value, version: expectedVersion + 1 } },
    deleteGraph: async (id, { expectedVersion }) => calls.push(`delete:${expectedVersion}`),
  }, { uuid: () => 'm' })
  sync.seed(graph())
  sync.queue(graph('two'))
  await sync.remove('g')
  sync.queue(graph('three'))
  await tick()
  assert.deepEqual(calls, ['save', 'delete:2'])
})

test('draft backups are isolated by account', () => {
  const data = new Map()
  const storage = { get length() { return data.size }, key: (index) => [...data.keys()][index], getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
  writeDraft(storage, 'alice', 'g', graph())
  assert.equal(readDrafts(storage, 'alice').g.id, 'g')
  assert.deepEqual(readDrafts(storage, 'bob'), {})
  writeDraft(storage, 'bob', 'g', null)
  assert.equal(readDrafts(storage, 'alice').g.id, 'g')
})

test('undoing to the acknowledged content after a failed save still queues the undo', async () => {
  const saved = []
  let attempts = 0
  const sync = new CloudSync({ saveGraph: async (value, options) => {
    attempts++
    if (attempts === 1) throw new Error('Lost response')
    saved.push(value.nodes[0].data.title)
    return { ...value, version: options.expectedVersion + 1 }
  } }, { uuid: () => String(attempts) })
  sync.seed(graph('original'))
  sync.queue(graph('changed'))
  await assert.rejects(sync.flush('g'))
  sync.queue(graph('original'))
  sync.retry('g')
  await sync.flush('g')
  assert.deepEqual(saved, ['changed', 'original'])
})

test('one tab acknowledging a save cannot clear another tab’s draft', () => {
  const data = new Map()
  const storage = { get length() { return data.size }, key: (index) => [...data.keys()][index], getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
  writeDraft(storage, 'alice', 'tab-a:g', graph('a'))
  writeDraft(storage, 'alice', 'tab-b:g', graph('b'))
  writeDraft(storage, 'alice', 'tab-a:g', null)
  assert.equal(readDrafts(storage, 'alice')['tab-b:g'].nodes[0].data.title, 'b')
})

test('an edit arriving during save finalization is drained before flush resolves', async () => {
  const saved = []
  const sync = new CloudSync({ saveGraph: async (value, options) => {
    saved.push(value.nodes[0].data.title)
    return { ...value, version: options.expectedVersion + 1 }
  } }, {
    uuid: () => String(saved.length),
    onSaved: (id, value) => {
      if (value.nodes[0].data.title === 'two') queueMicrotask(() => sync.queue(graph('three')))
    },
  })
  sync.seed(graph('one'))
  sync.queue(graph('two'))
  await sync.flush('g')
  assert.deepEqual(saved, ['two', 'three'])
})
