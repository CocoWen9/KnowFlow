const graphStorageKey = 'knowflow.graph.v1'
const graphStorageVersion = 2

export function cloneGraphSnapshot(nodes, edges) {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    })),
    edges: edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : edge.data,
      markerEnd:
        edge.markerEnd && typeof edge.markerEnd === 'object'
          ? { ...edge.markerEnd }
          : edge.markerEnd,
    })),
  }
}

function loadStoredGraph(fallbackGraph) {
  try {
    const storedValue = window.localStorage.getItem(graphStorageKey)

    if (!storedValue) {
      return fallbackGraph
    }

    const storedGraph = JSON.parse(storedValue)

    if (
      ![1, graphStorageVersion].includes(storedGraph?.version) ||
      !Array.isArray(storedGraph.nodes) ||
      !Array.isArray(storedGraph.edges)
    ) {
      return fallbackGraph
    }

    const nodesAreValid = storedGraph.nodes.every(
      (node) =>
        typeof node?.id === 'string' &&
        Number.isFinite(node?.position?.x) &&
        Number.isFinite(node?.position?.y) &&
        typeof node?.data?.title === 'string' &&
        typeof node?.data?.userMessage === 'string' &&
        typeof node?.data?.assistantMessage === 'string',
    )
    const nodeIds = new Set(storedGraph.nodes.map((node) => node.id))
    const edgesAreValid = storedGraph.edges.every(
      (edge) =>
        typeof edge?.id === 'string' &&
        nodeIds.has(edge?.source) &&
        nodeIds.has(edge?.target),
    )

    if (!nodesAreValid || !edgesAreValid) {
      return fallbackGraph
    }

    const normalizedNodes = storedGraph.nodes.map((storedNode) => {
      const node = { ...storedNode }
      delete node.dragHandle
      const interruptedAnswer = node.data.aiStatus === 'loading'

      return {
        ...node,
        type: 'conversation',
        position: { ...node.position },
        data: {
          ...node.data,
          ...(interruptedAnswer
            ? {
                aiStatus: 'error',
                assistantMessage: 'The previous answer was interrupted.',
              }
            : {}),
        },
      }
    })
    const isLegacyGraph = storedGraph.version === 1

    return {
      nodes: normalizedNodes,
      edges: storedGraph.edges.map((edge) => {
        const isStructuralEdge = Boolean(
          getStructuralChildId(edge, normalizedNodes),
        )
        const storedRelationshipType = edge.data?.relationshipType
        const relationshipType =
          isLegacyGraph && !isStructuralEdge && storedRelationshipType === 'follow-up'
            ? 'related-to'
            : storedRelationshipType ??
              (isStructuralEdge ? 'follow-up' : 'related-to')

        return {
          ...edge,
          sourceHandle: edge.sourceHandle ?? 'branch-source',
          targetHandle: edge.targetHandle ?? 'branch-target-top',
          data: {
            ...edge.data,
            relationshipType,
            note: typeof edge.data?.note === 'string' ? edge.data.note : '',
          },
          markerEnd: edge.markerEnd ? { ...edge.markerEnd } : undefined,
        }
      }),
    }
  } catch {
    return fallbackGraph
  }
}

export function getPersistableGraph(nodes, edges) {
  const stableNodes = nodes.filter((node) => !node.data.isPending)
  const stableNodeIds = new Set(stableNodes.map((node) => node.id))
  const persistableNodes = stableNodes.map(({ id, type, position, data }) => ({
    id,
    type,
    position,
    data,
  }))
  const persistableEdges = edges
    .filter(
      (edge) =>
        !edge.data?.isPending &&
        stableNodeIds.has(edge.source) &&
        stableNodeIds.has(edge.target),
    )
    .map(
      ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        type,
        data,
        markerEnd,
      }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        type,
        data,
        markerEnd,
      }),
    )

  return {
    nodes: persistableNodes,
    edges: persistableEdges,
  }
}

export function saveGraph(nodes, edges) {
  const persistableGraph = getPersistableGraph(nodes, edges)

  window.localStorage.setItem(
    graphStorageKey,
    JSON.stringify({
      version: graphStorageVersion,
      ...persistableGraph,
    }),
  )
}

const graphLibraryStorageKey = 'knowflow.graph-library.v1'
const graphLibraryStorageVersion = 1

export function createGraphId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }

  return `graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeLibraryGraph(graph) {
  if (
    typeof graph?.id !== 'string' ||
    !Array.isArray(graph?.nodes) ||
    !Array.isArray(graph?.edges)
  ) {
    return null
  }

  const snapshot = cloneGraphSnapshot(graph.nodes, graph.edges)

  return {
    id: graph.id,
    version: Number.isInteger(graph.version) ? graph.version : 0,
    pinned: Boolean(graph.pinned),
    createdAt: graph.createdAt ?? new Date().toISOString(),
    updatedAt: graph.updatedAt ?? graph.createdAt ?? new Date().toISOString(),
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      type: 'conversation',
      data: {
        ...node.data,
        ...(node.data.aiStatus === 'loading'
          ? {
              aiStatus: 'error',
              assistantMessage: 'The previous answer was interrupted.',
            }
          : {}),
      },
    })),
    edges: snapshot.edges,
  }
}

export function loadGraphLibrary(fallbackGraph) {
  try {
    const storedValue = window.localStorage.getItem(graphLibraryStorageKey)

    if (storedValue) {
      const storedLibrary = JSON.parse(storedValue)
      const graphs = storedLibrary?.graphs
        ?.map(normalizeLibraryGraph)
        .filter(Boolean)

      if (
        storedLibrary?.version === graphLibraryStorageVersion &&
        graphs?.length
      ) {
        const activeGraphId = graphs.some(
          (graph) => graph.id === storedLibrary.activeGraphId,
        )
          ? storedLibrary.activeGraphId
          : graphs[0].id

        return { activeGraphId, graphs }
      }
    }
  } catch {
    // Fall through to migrate the original single local graph.
  }

  const migratedGraph = loadStoredGraph(fallbackGraph)
  const now = new Date().toISOString()
  const graph = {
    id: 'local-freetoken',
    createdAt: now,
    updatedAt: now,
    ...migratedGraph,
  }

  return {
    activeGraphId: graph.id,
    graphs: [graph],
  }
}

export function saveGraphLibrary(graphs, activeGraphId) {
  window.localStorage.setItem(
    graphLibraryStorageKey,
    JSON.stringify({
      version: graphLibraryStorageVersion,
      activeGraphId,
      graphs,
    }),
  )
}

function getStructuralChildId(edge, nodes) {
  const source = nodes.find((node) => node.id === edge.source)
  const target = nodes.find((node) => node.id === edge.target)
  if (target?.data.parentId === source?.id) return target.id
  if (source?.data.parentId === target?.id) return source.id
  return null
}
