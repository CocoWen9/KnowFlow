import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContextCandidates,
  createContextPlan,
  estimateContextTokens,
  suggestContextCandidateIds,
} from './contextSelection.js'

function conversationNode(id, title, parentId, overrides = {}) {
  return {
    id,
    data: {
      title,
      parentId,
      userMessage: `Question about ${title}`,
      assistantMessage: `Explanation of ${title}`,
      ...overrides,
    },
  }
}

const nodes = [
  conversationNode('root', 'Computing systems'),
  conversationNode('parent', 'GPU memory', 'root'),
  conversationNode('sibling', 'CPU cache', 'root'),
  conversationNode('semantic', 'VRAM bandwidth'),
  conversationNode('pending', 'Draft node', null, { isPending: true }),
]

const edges = [
  {
    id: 'root-sibling',
    source: 'root',
    target: 'sibling',
    data: { relationshipType: 'follow-up' },
  },
  {
    id: 'parent-semantic',
    source: 'parent',
    target: 'semantic',
    data: {
      relationshipType: 'depends-on',
      note: 'GPU throughput is constrained by available memory bandwidth.',
    },
  },
  {
    id: 'parent-pending',
    source: 'parent',
    target: 'pending',
    data: { relationshipType: 'related-to' },
  },
]

test('builds candidates from explicit source, parent, ancestors, and semantic neighbors', () => {
  const candidates = buildContextCandidates({
    nodes,
    edges,
    parentNodeId: 'parent',
    source: { text: 'memory bandwidth', role: 'assistant' },
  })

  assert.deepEqual(
    candidates.map((candidate) => candidate.sourceType),
    ['selected-text', 'parent', 'ancestor', 'semantic'],
  )
  assert.equal(candidates.some((candidate) => candidate.nodeId === 'sibling'), false)
  assert.equal(candidates.some((candidate) => candidate.nodeId === 'pending'), false)
  assert.match(candidates.at(-1).relationship, /Depends on/)
})

test('suggests only relevant optional graph context within the budget', () => {
  const candidates = buildContextCandidates({
    nodes,
    edges,
    parentNodeId: 'parent',
    source: null,
  })
  const selectedIds = suggestContextCandidateIds(
    candidates,
    'How does VRAM bandwidth constrain the GPU?',
    2400,
  )

  assert.equal(selectedIds.has('parent:parent'), true)
  assert.equal(
    candidates
      .filter((candidate) => candidate.sourceType === 'semantic')
      .some((candidate) => selectedIds.has(candidate.id)),
    true,
  )
  assert.equal(selectedIds.has('ancestor:root'), false)
})

test('an explicit empty selection creates a context-free plan', () => {
  const candidates = buildContextCandidates({
    nodes,
    edges,
    parentNodeId: 'parent',
    source: null,
  })
  const plan = createContextPlan({
    candidates,
    selectedIds: new Set(),
    selectionMode: 'manual',
    tokenBudget: 1200,
  })

  assert.equal(plan.strategy, 'graph-aware-v1')
  assert.equal(plan.blocks.length, 0)
  assert.equal(plan.estimatedTokens, 0)
})

test('token estimates account conservatively for Chinese text', () => {
  assert.ok(estimateContextTokens('知识图谱上下文选择') > 4)
  assert.ok(
    estimateContextTokens('知识图谱上下文选择') >
      estimateContextTokens('short text'),
  )
})

test('omits transient AI status text from context snapshots', () => {
  const candidates = buildContextCandidates({
    nodes: [
      conversationNode('loading-parent', 'Loading topic', null, {
        aiStatus: 'loading',
        assistantMessage: 'Thinking…',
      }),
    ],
    edges: [],
    parentNodeId: 'loading-parent',
    source: null,
  })

  assert.doesNotMatch(candidates[0].text, /Thinking/)
  assert.match(candidates[0].text, /Question about Loading topic/)
})

test('handles parent cycles without duplicating candidates', () => {
  const cyclicNodes = [
    conversationNode('a', 'A', 'b'),
    conversationNode('b', 'B', 'a'),
  ]
  const candidates = buildContextCandidates({
    nodes: cyclicNodes,
    edges: [],
    parentNodeId: 'a',
    source: null,
  })

  assert.deepEqual(
    candidates.map((candidate) => candidate.nodeId),
    ['a', 'b'],
  )
})
