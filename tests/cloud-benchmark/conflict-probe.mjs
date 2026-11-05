import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { loadBenchmarkConfig } from './config.mjs'

const c = loadBenchmarkConfig()
assert.ok(c.online, 'Pass --online to probe the deployed services')
const authHeaders = { apikey: c.anonKey, 'Content-Type': 'application/json' }
async function signIn() {
  const response = await fetch(c.supabaseUrl + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ email: c.emailB, password: c.passwordB }),
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(response.status, 200)
  return (await response.json()).access_token
}
const [a, b] = await Promise.all([signIn(), signIn()])
const id = crypto.randomUUID()
const path = c.apiUrl + '/api/graphs/' + id
const graph = {
  id, pinned: false, edges: [],
  nodes: [{ id: 'root', position: { x: 0, y: 0 },
    data: { title: 'Synthetic conflict probe', userMessage: 'Question', assistantMessage: 'Answer', isRoot: true } }],
}
async function request(url, token, method, payload) {
  const start = performance.now()
  try {
    const response = await fetch(url, {
      method, headers: { ...authHeaders, Authorization: 'Bearer ' + token },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(35000),
    })
    const body = await response.json()
    return { status: response.status, ms: performance.now() - start, ray: response.headers.get('cf-ray'), body }
  } catch (error) {
    return { error: error.name, ms: performance.now() - start }
  }
}
const save = (token, graph, expectedVersion) => request(path, token, 'PUT', {
  graph, expectedVersion, mutationId: crypto.randomUUID(),
})
const seed = await save(a, graph, 0)
assert.equal(seed.status, 200)
const readB = await request(path, b, 'GET')
assert.equal(readB.body.graph.version, seed.body.graph.version)
const accepted = await save(a, { ...graph, pinned: true }, seed.body.graph.version)
assert.equal(accepted.status, 200)
const stale = { ...graph, nodes: [{ ...graph.nodes[0], data: { ...graph.nodes[0].data, title: 'Stale edit' } }] }
const worker = await save(b, stale, readB.body.graph.version)
const rpc = await request(c.supabaseUrl + '/rest/v1/rpc/save_graph', b, 'POST', {
  p_graph_id: id, p_expected_version: readB.body.graph.version, p_graph: stale, p_mutation_id: crypto.randomUUID(),
})
const readBack = await request(path, a, 'GET')
const result = {
  recordedAt: new Date().toISOString(), graphId: id,
  startingVersion: readB.body.graph.version, acceptedVersion: accepted.body.graph.version,
  worker, rpc, readBack,
  acceptedContentPreserved: readBack.status === 200 && readBack.body.graph.version === accepted.body.graph.version
    && readBack.body.graph.pinned === true && readBack.body.graph.nodes[0].data.title === graph.nodes[0].data.title,
}
writeFileSync(c.outputDir + '/conflict-probe.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
