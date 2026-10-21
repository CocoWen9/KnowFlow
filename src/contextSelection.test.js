import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContextCandidates,
  createAutomaticContextPlan,
  estimateContextTokens,
} from './contextSelection.js'
import { preparePrompt } from '../worker/src/index.js'

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

test('automatically selects relevant graph context within the budget', () => {
  const candidates = buildContextCandidates({
    nodes,
    edges,
    parentNodeId: 'parent',
    source: null,
  })
  const plan = createAutomaticContextPlan({
    candidates,
    question: 'How does VRAM bandwidth constrain the GPU?',
  })
  const selectedIds = new Set(plan.blocks.map((block) => block.id))

  assert.equal(selectedIds.has('parent:parent'), true)
  assert.equal(
    candidates
      .filter((candidate) => candidate.sourceType === 'semantic')
      .some((candidate) => selectedIds.has(candidate.id)),
    true,
  )
  assert.equal(selectedIds.has('ancestor:root'), false)
  assert.ok(plan.estimatedTokens <= plan.tokenBudget)
})

test('skips an oversized optional block and continues to a smaller relevant one', () => {
  function candidate({ defaultSelected = false, id, text, title }) {
    const relationship = defaultSelected ? 'Immediate parent' : 'Related to'

    return {
      id,
      nodeId: id,
      sourceType: defaultSelected ? 'parent' : 'semantic',
      relationship,
      title,
      text,
      defaultSelected,
      depth: 0,
      estimatedTokens: estimateContextTokens(
        `${title}\n${relationship}\n${text}`,
      ),
    }
  }

  const plan = createAutomaticContextPlan({
    candidates: [
      candidate({
        id: 'parent',
        title: 'Parent',
        text: 'p'.repeat(2600),
        defaultSelected: true,
      }),
      candidate({ id: 'large', title: 'Alpha', text: `alpha ${'x'.repeat(1000)}` }),
      candidate({ id: 'small', title: 'Beta', text: 'beta detail' }),
    ],
    question: 'Compare alpha and beta.',
    tokenBudget: 800,
  })
  const selectedIds = plan.blocks.map((block) => block.id)

  assert.equal(selectedIds.includes('parent'), true)
  assert.equal(selectedIds.includes('large'), false)
  assert.equal(selectedIds.includes('small'), true)
  assert.ok(plan.estimatedTokens <= plan.tokenBudget)
})

test('creates a context-free automatic plan for an independent root', () => {
  const plan = createAutomaticContextPlan({
    candidates: [],
    question: 'Start a new topic.',
  })

  assert.equal(plan.strategy, 'graph-aware-auto-v1')
  assert.equal(plan.blocks.length, 0)
  assert.equal(plan.estimatedTokens, 0)
})

test('uses automatic provenance for mandatory and ranked context', () => {
  const candidates = buildContextCandidates({
    nodes,
    edges,
    parentNodeId: 'parent',
    source: { text: 'memory bandwidth', role: 'assistant' },
  })
  const plan = createAutomaticContextPlan({
    candidates,
    question:
      'How do computing systems and VRAM bandwidth affect GPU memory?',
  })
  const selectedText = plan.blocks.find(
    (block) => block.sourceType === 'selected-text',
  )
  const parent = plan.blocks.find((block) => block.sourceType === 'parent')
  const ancestor = plan.blocks.find((block) => block.sourceType === 'ancestor')
  const semantic = plan.blocks.find((block) => block.sourceType === 'semantic')

  assert.equal(selectedText?.selectedBy, 'default-policy')
  assert.equal(parent?.selectedBy, 'default-policy')
  assert.equal(ancestor?.selectedBy, 'relevance-ranker')
  assert.equal(semantic?.selectedBy, 'relevance-ranker')
  assert.equal(plan.blocks.some((block) => block.selectedBy === 'user'), false)
})

test('automatically fits mandatory context when raw text exceeds the budget', () => {
  const candidates = buildContextCandidates({
    nodes: [
      conversationNode('long-parent', '超长父节点'.repeat(1000), null, {
        userMessage: '问题'.repeat(2000),
        assistantMessage: '解释'.repeat(4000),
      }),
    ],
    edges: [],
    parentNodeId: 'long-parent',
    source: { text: '选中原文'.repeat(1000), role: 'assistant' },
  })
  const plan = createAutomaticContextPlan({
    candidates,
    question: '请继续解释',
    tokenBudget: 800,
  })

  assert.deepEqual(
    plan.blocks.map((block) => block.sourceType),
    ['selected-text', 'parent'],
  )
  assert.equal(plan.blocks.every((block) => block.truncated), true)
  assert.ok(plan.estimatedTokens <= plan.tokenBudget)
  assert.ok(plan.blocks.every((block) => block.title.length <= 160))
})

test('matches the Worker token estimate after transport normalization', () => {
  const contractNodes = [
    conversationNode('contract-parent', '标题 🚀 '.repeat(100), null, {
      userMessage: 'Explain mixed English 与中文 context.',
      assistantMessage: 'A concise parent answer.',
    }),
    conversationNode('contract-semantic', 'Related concept'),
  ]
  const contractEdges = [
    {
      id: 'contract-edge',
      source: 'contract-parent',
      target: 'contract-semantic',
      data: {
        relationshipType: 'related-to',
        note: '关系说明 with emoji 🚀 '.repeat(80),
      },
    },
  ]
  const candidates = buildContextCandidates({
    nodes: contractNodes,
    edges: contractEdges,
    parentNodeId: 'contract-parent',
    source: { text: '明确选中的原文', role: 'assistant' },
  })
  const plan = createAutomaticContextPlan({
    candidates,
    question: 'How is the related concept connected?',
    tokenBudget: 4000,
  })
  const prepared = preparePrompt({
    question: 'How is the related concept connected?',
    contextBlocks: plan.blocks,
    tokenBudget: plan.tokenBudget,
  })

  assert.equal(prepared.error, undefined)
  assert.equal(plan.estimatedTokens, prepared.estimatedContextTokens)
  assert.ok(plan.blocks.every((block) => block.relationship.length <= 240))
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
