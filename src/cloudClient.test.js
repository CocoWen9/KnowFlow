import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudError, createCloudRepository, getAccessToken } from './cloudClient.js'

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function repository(fetchImpl, overrides = {}) {
  return createCloudRepository({
    baseUrl: 'https://workspace.example/',
    getToken: async () => 'session-token',
    fetchImpl,
    ...overrides,
  })
}

test('a valid current session supplies its access token without refreshing', async () => {
  const token = await getAccessToken({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'current-token', expires_at: Date.now() / 1000 + 600 } } }),
      refreshSession: async () => assert.fail('Valid sessions do not need a refresh.'),
    },
  })

  assert.equal(token, 'current-token')
})

test('expired sessions refresh through the SDK before returning a token', async () => {
  let refreshes = 0
  const token = await getAccessToken({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'old-token', expires_at: 1 } } }),
      refreshSession: async () => {
        refreshes += 1
        return { data: { session: { access_token: 'fresh-token', expires_at: Date.now() / 1000 + 600 } } }
      },
    },
  })

  assert.equal(token, 'fresh-token')
  assert.equal(refreshes, 1)
})

test('an account-bound operation rejects the token of a different signed-in account', async () => {
  await assert.rejects(() => getAccessToken({
    auth: {
      getSession: async () => ({ data: { session: {
        user: { id: 'bob' }, access_token: 'bob-token', expires_at: Date.now() / 1000 + 600,
      } } }),
      refreshSession: async () => assert.fail('The current token has not expired.'),
    },
  }, 'alice'), { status: 401, code: 'session_expired' })
})

test('refresh cannot transfer an account-bound operation to a different account', async () => {
  await assert.rejects(() => getAccessToken({
    auth: {
      getSession: async () => ({ data: { session: {
        user: { id: 'alice' }, access_token: 'alice-token', expires_at: 1,
      } } }),
      refreshSession: async () => ({ data: { session: {
        user: { id: 'bob' }, access_token: 'bob-token', expires_at: Date.now() / 1000 + 600,
      } } }),
    },
  }, 'alice'), { status: 401, code: 'session_expired' })
})

test('missing expiry information and unsuccessful refreshes never return a token', async () => {
  await assert.rejects(() => getAccessToken({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'unverifiable-token' } } }),
      refreshSession: async () => assert.fail('Malformed sessions must be rejected.'),
    },
  }), { status: 401, code: 'session_expired' })

  for (const refreshed of [
    { error: new Error('refresh unavailable') },
    { data: { session: { access_token: 'still-expired', expires_at: 1 } } },
    { data: { session: { access_token: 'missing-expiry' } } },
  ]) {
    await assert.rejects(() => getAccessToken({
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'old-token', expires_at: 1 } } }),
        refreshSession: async () => refreshed,
      },
    }), { status: 401, code: 'session_expired' })
  }
})

test('cloud reads and deletes use authenticated requests and unwrap the API envelopes', async () => {
  const calls = []
  const graph = { id: 'graph/one', version: 4, nodes: [], edges: [] }
  const results = [{ graphs: [graph] }, { graph }, { deleted: true }]
  const client = repository(async (url, options) => {
    calls.push({ url, options })
    return jsonResponse(results.shift())
  })

  assert.deepEqual(await client.listGraphs(), [graph])
  assert.deepEqual(await client.getGraph(graph.id), graph)
  assert.deepEqual(await client.deleteGraph(graph.id, { expectedVersion: 4 }), { deleted: true })
  assert.deepEqual(calls.map(({ url }) => url), [
    'https://workspace.example/api/graphs',
    'https://workspace.example/api/graphs/graph%2Fone',
    'https://workspace.example/api/graphs/graph%2Fone',
  ])
  assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer session-token'))
  assert.ok(calls.every(({ options }) => options.credentials === 'omit'))
  assert.equal(calls[2].options.method, 'DELETE')
  assert.deepEqual(JSON.parse(calls[2].options.body), { expectedVersion: 4 })
})

test('saving preserves the optimistic version and mutation identity', async () => {
  const graph = { id: 'graph-one', nodes: [], edges: [] }
  let sentBody
  const client = repository(async (url, options) => {
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers['Content-Type'], 'application/json')
    sentBody = JSON.parse(options.body)
    return jsonResponse({ graph: { ...graph, version: 2 } })
  })

  assert.equal((await client.saveGraph(graph, { expectedVersion: 1, mutationId: 'save-one' })).version, 2)
  assert.deepEqual(sentBody, { graph, expectedVersion: 1, mutationId: 'save-one' })
})

test('version conflicts retain their code and status without retrying the write', async () => {
  let requests = 0
  const client = repository(async () => {
    requests += 1
    return jsonResponse({ error: 'This graph changed on another device.', code: 'version_conflict' }, 409)
  })

  await assert.rejects(
    () => client.saveGraph({ id: 'graph-one' }, { expectedVersion: 1, mutationId: 'save-one' }),
    (error) => error instanceof CloudError && error.status === 409 && error.code === 'version_conflict',
  )
  assert.equal(requests, 1)
})

test('missing sessions fail before any graph data is sent', async () => {
  let requests = 0
  const client = repository(async () => {
    requests += 1
    return jsonResponse({ graphs: [] })
  }, { getToken: async () => null })

  await assert.rejects(() => client.listGraphs(), { status: 401, code: 'session_expired' })
  assert.equal(requests, 0)
})

test('oversized writes are measured in UTF-8 bytes and rejected before transmission', async () => {
  let requests = 0
  const client = repository(async () => {
    requests += 1
    return jsonResponse({})
  })

  await assert.rejects(
    () => client.saveGraph({ id: 'graph-one', text: '学'.repeat(360_000) }, { expectedVersion: 1 }),
    { status: 413, code: 'request_too_large' },
  )
  assert.equal(requests, 0)
})

test('response size limits apply to streamed bodies without a content length', async () => {
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1))
    },
    cancel() {
      cancelled = true
    },
  })
  const client = repository(async () => new Response(stream))

  await assert.rejects(() => client.listGraphs(), { code: 'response_too_large' })
  assert.equal(cancelled, true)
})

test('unrecognized successful responses fail instead of replacing local data', async () => {
  const client = repository(async () => jsonResponse({ graphs: null }))

  await assert.rejects(() => client.listGraphs(), { code: 'invalid_response' })
})

test('network write failures do not expose internal errors or automatically retry', async () => {
  let requests = 0
  const client = repository(async () => {
    requests += 1
    throw new Error('internal request included session-token')
  })

  await assert.rejects(() => client.saveGraph({ id: 'graph-one' }), (error) => {
    assert.equal(error.code, 'network_error')
    assert.match(error.message, /may already be saved/)
    assert.doesNotMatch(error.message, /session-token|internal/)
    return true
  })
  assert.equal(requests, 1)
})

test('timed out requests are aborted and report an uncertain write result', async (context) => {
  const realSetTimeout = globalThis.setTimeout
  context.mock.method(globalThis, 'setTimeout', (callback) => realSetTimeout(callback, 0))
  let requests = 0
  const client = repository(async (url, { signal }) => {
    requests += 1
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
  })

  await assert.rejects(() => client.deleteGraph('graph-one', { expectedVersion: 1 }), (error) => {
    assert.equal(error.code, 'request_timeout')
    assert.match(error.message, /may already be saved/)
    return true
  })
  assert.equal(requests, 1)
})
