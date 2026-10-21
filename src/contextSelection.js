export const defaultContextTokenBudget = 2400

export const contextTokenBudgetOptions = [1200, 2400, 3600]

const maximumConversationCharacters = 4800
const maximumSelectedTextCharacters = 1200
const maximumSuggestedBlocks = 3
const maximumContextCandidates = 12
const englishStopWords = new Set([
  'and',
  'are',
  'can',
  'could',
  'does',
  'for',
  'from',
  'how',
  'into',
  'the',
  'this',
  'what',
  'when',
  'where',
  'which',
  'why',
  'with',
  'would',
])

const relationshipNames = {
  'related-to': 'Related to',
  explains: 'Explains',
  'example-of': 'Example of',
  'depends-on': 'Depends on',
  contradicts: 'Contradicts',
  'compares-with': 'Compares with',
  'user-note': 'User note',
}

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function normalizeText(value) {
  return typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[\t ]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    : ''
}

function truncateText(value, maximumCharacters) {
  const text = normalizeText(value)

  if (text.length <= maximumCharacters) {
    return text
  }

  const headLength = Math.ceil(maximumCharacters * 0.68)
  const tailLength = maximumCharacters - headLength

  return `${text.slice(0, headLength).trimEnd()}\n…\n${text.slice(-tailLength).trimStart()}`
}

export function estimateContextTokens(value) {
  const text = typeof value === 'string' ? value : ''
  const hanCharacters = (text.match(/[\p{Script=Han}]/gu) ?? []).length
  const otherCharacters = Math.max(0, text.length - hanCharacters)

  return Math.max(1, Math.ceil(hanCharacters / 1.5 + otherCharacters / 4))
}

function conversationText(node) {
  const title = normalizeWhitespace(node?.data?.title) || 'Untitled'
  const storedQuestion = normalizeWhitespace(node?.data?.userMessage)
  const storedAnswer = normalizeWhitespace(node?.data?.assistantMessage)
  const question =
    storedQuestion === 'Waiting for your question…'
      ? ''
      : truncateText(node?.data?.userMessage, 1600)
  const answerIsPlaceholder =
    ['loading', 'error'].includes(node?.data?.aiStatus) ||
    [
      'Thinking…',
      'This child is a draft.',
      'This node is temporary.',
      'Couldn’t generate an answer.',
      'The previous answer was interrupted.',
    ].includes(storedAnswer)
  const answer = answerIsPlaceholder
    ? ''
    : truncateText(node?.data?.assistantMessage, 3000)

  return truncateText(
    [
      `Title: ${title}`,
      question ? `User: ${question}` : '',
      answer ? `AI: ${answer}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    maximumConversationCharacters,
  )
}

function edgeDescription(edge) {
  const relationshipType = edge?.data?.relationshipType ?? 'related-to'
  const relationship = relationshipNames[relationshipType] ?? 'Connected to'
  const note = truncateText(edge?.data?.note, 600)

  return note ? `${relationship}. Edge note: ${note}` : relationship
}

function createCandidate({
  defaultSelected = false,
  depth = 0,
  id,
  nodeId,
  relationship,
  sourceType,
  text,
  title,
}) {
  const normalizedText = normalizeText(text)
  const estimatedTokens = estimateContextTokens(
    `${title}\n${relationship}\n${normalizedText}`,
  )

  return {
    id,
    nodeId,
    sourceType,
    relationship,
    title,
    text: normalizedText,
    defaultSelected,
    depth,
    estimatedTokens,
  }
}

export function buildContextCandidates({
  edges,
  nodes,
  parentNodeId,
  source,
}) {
  if (!parentNodeId || !Array.isArray(nodes)) {
    return []
  }

  const stableNodes = nodes.filter((node) => !node?.data?.isPending)
  const nodeById = new Map(stableNodes.map((node) => [node.id, node]))
  const parentNode = nodeById.get(parentNodeId)

  if (!parentNode) {
    return []
  }

  const candidates = []
  const sourceText = truncateText(source?.text, maximumSelectedTextCharacters)

  if (sourceText) {
    const sourceRole = source?.role === 'user' ? 'User' : 'AI'

    candidates.push(
      createCandidate({
        id: `selected-text:${parentNodeId}:${sourceRole.toLowerCase()}`,
        nodeId: parentNodeId,
        sourceType: 'selected-text',
        relationship: `Selected from ${sourceRole}`,
        title: `Selected ${sourceRole} text`,
        text: sourceText,
        defaultSelected: true,
      }),
    )
  }

  candidates.push(
    createCandidate({
      id: `parent:${parentNodeId}`,
      nodeId: parentNodeId,
      sourceType: 'parent',
      relationship: 'Immediate parent',
      title: parentNode.data.title || 'Parent conversation',
      text: conversationText(parentNode),
      defaultSelected: true,
    }),
  )

  const lineageIds = new Set([parentNodeId])
  let ancestorId = parentNode.data.parentId
  let depth = 1

  while (ancestorId && depth <= 4 && !lineageIds.has(ancestorId)) {
    const ancestor = nodeById.get(ancestorId)

    if (!ancestor) {
      break
    }

    lineageIds.add(ancestor.id)
    candidates.push(
      createCandidate({
        id: `ancestor:${ancestor.id}`,
        nodeId: ancestor.id,
        sourceType: 'ancestor',
        relationship: depth === 1 ? 'Grandparent' : `Ancestor · ${depth + 1} levels up`,
        title: ancestor.data.title || 'Ancestor conversation',
        text: conversationText(ancestor),
        depth,
      }),
    )
    ancestorId = ancestor.data.parentId
    depth += 1
  }

  const semanticNodeIds = new Set()
  const stableEdges = Array.isArray(edges) ? edges : []

  stableEdges.forEach((edge) => {
    const relationshipType = edge?.data?.relationshipType ?? 'related-to'

    if (relationshipType === 'follow-up' || edge?.data?.isPending) {
      return
    }

    const sourceIsLineage = lineageIds.has(edge.source)
    const targetIsLineage = lineageIds.has(edge.target)

    if (sourceIsLineage === targetIsLineage) {
      return
    }

    const relatedNodeId = sourceIsLineage ? edge.target : edge.source

    if (lineageIds.has(relatedNodeId) || semanticNodeIds.has(relatedNodeId)) {
      return
    }

    const relatedNode = nodeById.get(relatedNodeId)

    if (!relatedNode) {
      return
    }

    semanticNodeIds.add(relatedNodeId)
    candidates.push(
      createCandidate({
        id: `semantic:${edge.id}:${relatedNodeId}`,
        nodeId: relatedNodeId,
        sourceType: 'semantic',
        relationship: edgeDescription(edge),
        title: relatedNode.data.title || 'Connected conversation',
        text: conversationText(relatedNode),
      }),
    )
  })

  return candidates.slice(0, maximumContextCandidates)
}

function queryTerms(value) {
  const normalized = normalizeWhitespace(value).toLocaleLowerCase()
  const terms = new Set()

  for (const match of normalized.matchAll(/[\p{L}\p{N}]+/gu)) {
    const token = match[0]

    if (
      (token.length >= 3 || /[\p{Script=Han}]/u.test(token)) &&
      !englishStopWords.has(token)
    ) {
      terms.add(token)
    }

    const hanOnly = [...token].filter((character) =>
      /[\p{Script=Han}]/u.test(character),
    )

    hanOnly.forEach((character) => terms.add(character))

    for (let index = 0; index < hanOnly.length - 1; index += 1) {
      terms.add(`${hanOnly[index]}${hanOnly[index + 1]}`)
    }
  }

  return [...terms]
}

export function scoreContextCandidate(candidate, question) {
  if (candidate.defaultSelected) {
    return 1000
  }

  const terms = queryTerms(question)

  if (!terms.length) {
    return 0
  }

  const title = normalizeWhitespace(candidate.title).toLocaleLowerCase()
  const searchableText = `${title}\n${candidate.text}`.toLocaleLowerCase()
  let score = 0

  terms.forEach((term) => {
    if (title.includes(term)) {
      score += 5
    }

    if (searchableText.includes(term)) {
      score += 1
    }
  })

  if (score > 0) {
    if (candidate.sourceType === 'semantic') {
      score += 0.75
    } else if (candidate.sourceType === 'ancestor') {
      score += Math.max(0.1, 0.6 - candidate.depth * 0.1)
    }
  }

  return score
}

export function rankContextCandidates(candidates, question) {
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      relevanceScore: scoreContextCandidate(candidate, question),
      originalIndex: index,
    }))
    .sort((first, second) => {
      if (first.defaultSelected !== second.defaultSelected) {
        return Number(second.defaultSelected) - Number(first.defaultSelected)
      }

      return (
        second.relevanceScore - first.relevanceScore ||
        first.originalIndex - second.originalIndex
      )
    })
    .map(({ originalIndex, ...candidate }) => candidate)
}

export function suggestContextCandidateIds(
  candidates,
  question,
  tokenBudget = defaultContextTokenBudget,
) {
  const rankedCandidates = rankContextCandidates(candidates, question)
  const selectedIds = new Set()
  let selectedTokens = 0
  let suggestedBlocks = 0

  rankedCandidates.forEach((candidate) => {
    if (!candidate.defaultSelected) {
      return
    }

    selectedIds.add(candidate.id)
    selectedTokens += candidate.estimatedTokens
  })

  rankedCandidates.forEach((candidate) => {
    if (
      candidate.defaultSelected ||
      candidate.relevanceScore <= 0 ||
      suggestedBlocks >= maximumSuggestedBlocks ||
      selectedTokens + candidate.estimatedTokens > tokenBudget
    ) {
      return
    }

    selectedIds.add(candidate.id)
    selectedTokens += candidate.estimatedTokens
    suggestedBlocks += 1
  })

  return selectedIds
}

export function createContextPlan({
  candidates,
  selectedIds,
  selectionMode,
  tokenBudget = defaultContextTokenBudget,
}) {
  const blocks = candidates
    .filter((candidate) => selectedIds.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      nodeId: candidate.nodeId,
      sourceType: candidate.sourceType,
      relationship: candidate.relationship,
      title: candidate.title,
      text: candidate.text,
      selectedBy:
        candidate.sourceType === 'selected-text'
          ? 'user'
          : selectionMode === 'manual'
            ? 'user'
            : candidate.defaultSelected
              ? 'default-policy'
              : 'relevance-ranker',
      estimatedTokens: candidate.estimatedTokens,
    }))

  return {
    strategy: 'graph-aware-v1',
    tokenBudget,
    estimatedTokens: blocks.reduce(
      (total, block) => total + block.estimatedTokens,
      0,
    ),
    blocks,
  }
}
