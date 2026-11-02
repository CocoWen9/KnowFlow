// Manual browser fixture: in-memory cloud only; never contacts a real account.
import React, { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Workspace from '../src/App.jsx'
import '@xyflow/react/dist/style.css'
import '../src/styles.css'
import '../src/cloud.css'

const graphId = '11111111-1111-4111-8111-111111111111'
const initial = { id: graphId, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pinned: false,
  nodes: [{ id: 'root', type: 'conversation', position: { x: 0, y: 0 }, data: { title: 'Cloud test', isRoot: true, userMessage: 'A saved question', assistantMessage: 'A saved answer' } }], edges: [] }
const records = new Map([[graphId, structuredClone(initial)]])
let failNext = false
const repository = {
  async getGraph(id) {
    if (!records.has(id)) throw Object.assign(new Error('Not found'), { status: 404 })
    return structuredClone(records.get(id))
  },
  async saveGraph(graph, { expectedVersion, mutationId }) {
    if (failNext) { failNext = false; throw new Error('Simulated connection loss') }
    const current = records.get(graph.id)
    if (current?.mutationId === mutationId) return structuredClone(current)
    if ((current?.version ?? 0) !== expectedVersion) throw Object.assign(new Error('Changed in another tab'), { status: 409 })
    const saved = { ...structuredClone(graph), version: expectedVersion + 1, mutationId }
    records.set(graph.id, saved)
    return structuredClone(saved)
  },
  async deleteGraph(id, { expectedVersion }) {
    if (records.get(id)?.version !== expectedVersion) throw Object.assign(new Error('Changed elsewhere'), { status: 409 })
    records.delete(id)
    return { deleted: true }
  },
}
function Fixture() {
  const [message, setMessage] = useState('In-memory test workspace')
  return <>
    <div style={{ padding: 8, height: 40, display: 'flex', gap: 12 }}>
      <button onClick={() => { const graph = records.get(graphId); graph.version++; graph.nodes[0].data.assistantMessage = 'Changed remotely'; setMessage('Remote version advanced') }}>Simulate remote edit</button>
      <button onClick={() => { failNext = true; setMessage('Next save will fail') }}>Fail next save</button>
      <span>{message}</span>
    </div>
    <div style={{ height: 'calc(100vh - 40px)' }}>
      <Workspace initialLibrary={{ activeGraphId: graphId, graphs: [structuredClone(initial)] }} repository={repository}
        session={{ user: { id: 'browser-smoke-user', email: 'test@example.invalid' } }} onAccount={() => setMessage('Account clicked')} onGoLocal={() => setMessage('Local clicked')} />
    </div>
  </>
}
createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>)
