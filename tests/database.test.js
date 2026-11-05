import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createCloudRepository } from '../src/cloudClient.js'
import { handleGraphs } from '../worker/src/api.js'

const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const id = '11111111-1111-4111-8111-111111111111'
const mutation = (n) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`
const node = (id, parentId) => ({ id, position: { x: 0, y: 2 }, data: { title: id, userMessage: 'Question', assistantMessage: 'Answer', ...(parentId ? { parentId } : {}) } })
const graph = { id, nodes: [node('root'), node('child', 'root')], edges: [{ id: 'edge', source: 'root', target: 'child', data: { relationshipType: 'depends-on', note: 'A relationship' } }] }

test('real PostgreSQL enforces ownership, atomic graph writes and optimistic concurrency', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`)
  await db.query('insert into auth.users values ($1),($2)', [alice, bob])
  await db.exec(await readFile(new URL('../supabase/migrations/202610290001_cloud_graphs.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/202611040001_conflict_http_response.sql', import.meta.url), 'utf8'))
  async function user(who) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who])
    await db.exec('set role authenticated')
  }
  async function save(value, version, n) {
    return (await db.query('select public.save_graph($1,$2,$3::jsonb,$4) as graph', [id, version, JSON.stringify(value), mutation(n)])).rows[0].graph
  }
  await user(alice)
  // Exercise the actual browser client -> Worker -> RPC -> PostgreSQL contract.
  const repository = createCloudRepository({
    baseUrl: 'https://worker.test', getToken: async () => 'alice-token',
    fetchImpl: async (url, options) => {
      const body = await handleGraphs(new Request(url, options), {
        SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      }, async (upstreamUrl, upstreamOptions) => {
        assert.equal(upstreamOptions.headers.Authorization, 'Bearer alice-token')
        if (upstreamUrl.endsWith('/auth/v1/user')) return Response.json({ id: alice })
        const args = JSON.parse(upstreamOptions.body)
        const result = await db.query('select public.save_graph($1,$2,$3::jsonb,$4) as graph', [args.p_graph_id, args.p_expected_version, JSON.stringify(args.p_graph), args.p_mutation_id])
        return Response.json(result.rows[0].graph)
      })
      return Response.json(body)
    },
  })
  const saved = await repository.saveGraph(graph, { expectedVersion: 0, mutationId: mutation(1) })
  assert.equal(saved.version, 1)
  assert.equal(saved.nodes[1].data.parentId, 'root')
  assert.equal(saved.edges[0].data.relationshipType, 'depends-on')
  assert.equal((await save(graph, 0, 1)).version, 1, 'lost responses can retry idempotently')
  await assert.rejects(save({ ...graph, pinned: true }, 0, 2), { code: 'PGRST', detail: '{"status":409,"headers":{}}' })
  await assert.rejects(db.query('delete from public.nodes where graph_id=$1', [id]), { code: '42501' })
  await user(bob)
  assert.deepEqual((await db.query('select public.list_graphs() as graphs')).rows[0].graphs, [])
  assert.equal((await db.query('select * from public.nodes')).rows.length, 0)
  await assert.rejects(db.query('select public.get_graph($1)', [id]), { code: 'P0002' })
  await assert.rejects(save(graph, 0, 3), { code: 'P0002' })
  await user(alice)
  const invalid = structuredClone(graph)
  invalid.edges[0].target = 'missing'
  await assert.rejects(save(invalid, 1, 4), { code: '23503' })
  assert.equal((await db.query('select public.get_graph($1) as graph', [id])).rows[0].graph.version, 1)
  const cycle = structuredClone(graph)
  cycle.nodes[0].data.parentId = 'child'
  await assert.rejects(save(cycle, 1, 5), { code: '22023' })
  const parent = structuredClone(graph)
  parent.nodes[1].data.parentId = 'other-graph-node'
  await assert.rejects(save(parent, 1, 6), { code: '23503' })
  const next = await save({ ...graph, pinned: true }, 1, 7)
  assert.equal(next.version, 2)
  assert.equal(next.pinned, true)
  await assert.rejects(db.query('select public.delete_graph($1,1)', [id]), { code: 'PGRST', detail: '{"status":409,"headers":{}}' })
  await db.query('select public.delete_graph($1,2)', [id])
  assert.equal((await db.query('select * from public.nodes')).rows.length, 0)
  await assert.rejects(save(graph, 2, 8), { code: 'P0002' })
  await db.exec('reset role; set role anon')
  await assert.rejects(db.query('select public.list_graphs()'), { code: '42501' })
})
