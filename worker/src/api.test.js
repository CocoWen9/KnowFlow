import test from 'node:test'
import assert from 'node:assert/strict'
import { handleGraphs, authenticate, readJson } from './api.js'
import worker from './index.js'
const id = '11111111-1111-4111-8111-111111111111'
const mutationId = '22222222-2222-4222-8222-222222222222'
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }
const request = (method = 'GET', body) => new Request(`https://worker.test/api/graphs/${id}`, { method, headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })

test('graph save verifies identity and forwards user permissions, version and mutation ID', async () => {
  const calls = []
  const graph = { id, nodes: [], edges: [] }
  const result = await handleGraphs(request('PUT', { graph, expectedVersion: 0, mutationId }), env, async (url, options) => {
    calls.push({ url, options })
    assert.equal(options.headers.Authorization, 'Bearer user-token')
    return Response.json(url.endsWith('/user') ? { id } : { ...graph, version: 1 })
  })
  assert.equal(result.graph.version, 1)
  assert.equal(calls[1].url, `${env.SUPABASE_URL}/rest/v1/rpc/save_graph`)
  assert.equal(JSON.parse(calls[1].options.body).p_mutation_id, mutationId)
  assert.equal(JSON.parse(calls[1].options.body).p_expected_version, 0)
})

test('database conflicts and missing graphs retain actionable HTTP statuses', async () => {
  for (const [code, status] of [['40001', 409], ['P0002', 404], ['23503', 400]]) {
    await assert.rejects(handleGraphs(request(), env, async (url) => Response.json(url.endsWith('/user') ? { id } : { code }, { status: url.endsWith('/user') ? 200 : 400 })), { status })
  }
})

test('missing or forged identity fails before any database request', async () => {
  let calls = 0
  await assert.rejects(authenticate(new Request('https://worker.test/api/graphs'), env, async () => { calls++; return Response.json({ id }) }), { status: 401 })
  assert.equal(calls, 0)
  await assert.rejects(authenticate(request(), env, async () => Response.json({ message: 'Invalid token' }, { status: 401 })), { status: 401 })
  await assert.rejects(authenticate(request(), { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_bad' }), { status: 503 })
})

test('request parsing bounds actual bytes even without content length', async () => {
  await assert.rejects(readJson(new Request('https://worker.test', { method: 'POST', body: JSON.stringify({ data: 'x'.repeat(1024 * 1024) }) })), { status: 413 })
  await assert.rejects(readJson(new Request('https://worker.test', { method: 'POST', body: '[]' })), { status: 400 })
})

test('CORS includes authentication and database methods; partial cloud config fails closed', async () => {
  const preflight = await worker.fetch(new Request('https://worker.test/api/graphs', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), {})
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/)
  assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /PUT/)
  const denied = await worker.fetch(new Request('https://worker.test/health', { headers: { Origin: 'https://untrusted.invalid' } }), {})
  assert.equal(denied.status, 403)
  const ai = await worker.fetch(new Request('https://worker.test/api/answer', { method: 'POST', body: JSON.stringify({ question: 'Test' }) }), { SUPABASE_URL: env.SUPABASE_URL })
  assert.equal(ai.status, 503)
})
