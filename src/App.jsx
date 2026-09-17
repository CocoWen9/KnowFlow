import { useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'

function AdjustableEdge({
  data,
  id,
  markerEnd,
  selected,
  sourcePosition,
  sourceX,
  sourceY,
  style,
  targetPosition,
  targetX,
  targetY,
}) {
  const { screenToFlowPosition } = useReactFlow()
  const [isDragging, setIsDragging] = useState(false)
  const dragOrigin = useRef(null)
  const [defaultPath, defaultControlX, defaultControlY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const storedControlPoint = data?.controlPoint
  const hasStoredControlPoint =
    Number.isFinite(storedControlPoint?.x) &&
    Number.isFinite(storedControlPoint?.y)
  const controlPoint = hasStoredControlPoint
    ? storedControlPoint
    : { x: defaultControlX, y: defaultControlY }
  const quadraticControl = {
    x: controlPoint.x * 2 - (sourceX + targetX) / 2,
    y: controlPoint.y * 2 - (sourceY + targetY) / 2,
  }
  const edgePath = hasStoredControlPoint
    ? `M ${sourceX} ${sourceY} Q ${quadraticControl.x} ${quadraticControl.y} ${targetX} ${targetY}`
    : defaultPath

  function beginDragging(event) {
    if (event.button !== 0 || data?.isPending) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const pointerPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    dragOrigin.current = {
      pointerPosition,
      controlPoint: { ...controlPoint },
    }
    setIsDragging(true)
    event.target.setPointerCapture?.(event.pointerId)
    data?.onCurveDragStart?.(id)
  }

  function updateControlPoint(event) {
    if (!dragOrigin.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const pointerPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    data?.onCurveChange?.(id, {
      x:
        dragOrigin.current.controlPoint.x +
        pointerPosition.x -
        dragOrigin.current.pointerPosition.x,
      y:
        dragOrigin.current.controlPoint.y +
        pointerPosition.y -
        dragOrigin.current.pointerPosition.y,
    })
  }

  function finishDragging() {
    if (!dragOrigin.current) {
      return
    }

    dragOrigin.current = null
    setIsDragging(false)
    data?.onCurveDragEnd?.(id)
  }

  return (
    <>
      <g
        className={`adjustable-edge-drag-layer nopan ${data?.isPending ? 'adjustable-edge-drag-layer--disabled' : ''} ${isDragging ? 'adjustable-edge-drag-layer--dragging' : ''}`}
        onPointerDown={beginDragging}
        onPointerMove={updateControlPoint}
        onPointerUp={(event) => {
          event.preventDefault()
          event.stopPropagation()
          finishDragging()
        }}
        onLostPointerCapture={finishDragging}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={style}
          interactionWidth={30}
        />
      </g>

      {!data?.isPending && (
        <EdgeLabelRenderer>
          <button
            className={`edge-curve-handle nodrag nopan ${selected ? 'edge-curve-handle--selected' : ''} ${isDragging ? 'edge-curve-handle--dragging' : ''}`}
            type="button"
            aria-label="Drag to reshape edge"
            style={{
              transform: `translate(-50%, -50%) translate(${controlPoint.x}px, ${controlPoint.y}px)`,
            }}
            onPointerDown={beginDragging}
            onPointerMove={updateControlPoint}
            onPointerUp={(event) => {
              event.preventDefault()
              event.stopPropagation()
              finishDragging()
            }}
            onLostPointerCapture={finishDragging}
          >
            <span aria-hidden="true" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

function ConversationNode({ id, data }) {
  return (
    <article
      className={`conversation-card ${data.isRoot ? 'conversation-card--root' : ''} ${data.isPending ? 'conversation-card--pending' : ''}`}
      data-conversation-node-id={id}
    >
      <Handle
        id="branch-target-top"
        className="node-top-target-handle"
        type="target"
        position={Position.Top}
        isConnectable={false}
        aria-hidden="true"
      />

      <header className="conversation-card__header">
        <span className="conversation-card__icon" aria-hidden="true">
          {data.isRoot ? 'K' : '↳'}
        </span>
        <h2>{data.title}</h2>
      </header>

      <div className="message message--user" data-message-role="user">
        <span>User</span>
        <p>
          <HighlightedText
            text={data.userMessage}
            term={data.highlightedRole === 'user' ? data.highlightedTerm : null}
          />
        </p>
      </div>

      <div className="message message--assistant" data-message-role="assistant">
        <span>AI</span>
        <p>
          <HighlightedText
            text={data.assistantMessage}
            term={data.highlightedRole === 'assistant' ? data.highlightedTerm : null}
          />
        </p>
      </div>

      <Handle
        id="branch-target-bottom"
        className="node-bottom-target-handle"
        type="target"
        position={Position.Bottom}
        isConnectable={!data.isPending}
        aria-label={`Connect to ${data.title}`}
      >
        <span aria-hidden="true">+</span>
      </Handle>

      {!data.isPending && (
        <Handle
          id="branch-source"
          className="node-add-handle"
          type="source"
          position={Position.Bottom}
          aria-label={`Start a connection from ${data.title}`}
        >
          <span aria-hidden="true">+</span>
        </Handle>
      )}
    </article>
  )
}

function HighlightedText({ text, term }) {
  if (!term) {
    return text
  }

  const termStart = text.indexOf(term)

  if (termStart === -1) {
    return text
  }

  return (
    <>
      {text.slice(0, termStart)}
      <mark className="concept-highlight">{term}</mark>
      {text.slice(termStart + term.length)}
    </>
  )
}

function NodeDetails({
  draftNodeId,
  initialChildTitle,
  node,
  onAddChild,
  onCancelChild,
  onClose,
  onStartChild,
}) {
  const [isAddingChild, setIsAddingChild] = useState(Boolean(initialChildTitle))
  const [childTitle, setChildTitle] = useState(initialChildTitle ?? '')
  const [childQuestion, setChildQuestion] = useState('')
  const childDraftStarted = useRef(false)
  const childDraftStatusMounted = useRef(false)
  const canAddChild = childTitle.trim() && childQuestion.trim()

  function beginChildDraft() {
    setIsAddingChild(true)

    if (childDraftStarted.current) {
      return
    }

    childDraftStarted.current = true
    onStartChild({ title: childTitle.trim() })
  }

  useEffect(() => {
    if (initialChildTitle) {
      beginChildDraft()
    }
  }, [])

  useEffect(() => {
    if (!childDraftStatusMounted.current) {
      childDraftStatusMounted.current = true
      return
    }

    if (childDraftStarted.current && !draftNodeId) {
      childDraftStarted.current = false
      setIsAddingChild(false)
    }
  }, [draftNodeId])

  function handleSubmit(event) {
    event.preventDefault()

    if (!canAddChild) {
      return
    }

    childDraftStarted.current = false
    onAddChild({
      title: childTitle.trim(),
      question: childQuestion.trim(),
    })
  }

  function handleCancelChild() {
    childDraftStarted.current = false
    setIsAddingChild(false)
    setChildTitle(initialChildTitle ?? '')
    setChildQuestion('')
    onCancelChild()
  }

  function handleClose() {
    if (childDraftStarted.current) {
      childDraftStarted.current = false
      onCancelChild()
    }

    onClose()
  }

  return (
    <aside
      className="details-panel"
      aria-label="Node details"
      data-conversation-node-id={node.id}
      data-testid="node-details"
    >
      <header className="details-panel__header">
        <div>
          <p className="details-panel__eyebrow">Node details</p>
          <h2>{node.data.title}</h2>
        </div>
        <button className="details-panel__close" type="button" onClick={handleClose} aria-label="Close details">
          ×
        </button>
      </header>

      <section className="details-section">
        <h3>Origin</h3>
        <p className="details-origin">{node.data.origin}</p>
      </section>

      <section className="details-section details-section--conversation">
        <div className="details-message details-message--user" data-message-role="user">
          <span>User</span>
          <p>{node.data.userMessage}</p>
        </div>
        <div className="details-message details-message--assistant" data-message-role="assistant">
          <span>AI</span>
          <p>{node.data.assistantMessage}</p>
        </div>
      </section>

      <section className="details-section details-section--add-child">
        {!isAddingChild ? (
          <button
            className="details-add-button"
            type="button"
            onClick={beginChildDraft}
          >
            Add child node
          </button>
        ) : (
          <form className="child-form" onSubmit={handleSubmit}>
            <div className="child-form__field">
              <label htmlFor={`child-title-${node.id}`}>Title</label>
              <input
                id={`child-title-${node.id}`}
                type="text"
                value={childTitle}
                onChange={(event) => setChildTitle(event.target.value)}
                placeholder="e.g. Tensor Core"
                maxLength="120"
                autoFocus
                required
              />
            </div>

            <div className="child-form__field">
              <label htmlFor={`child-question-${node.id}`}>Question</label>
              <textarea
                id={`child-question-${node.id}`}
                value={childQuestion}
                onChange={(event) => setChildQuestion(event.target.value)}
                placeholder="What would you like to understand?"
                rows="3"
                required
              />
            </div>

            <p className="child-form__note">The AI answer will be empty for now.</p>

            <div className="child-form__actions">
              <button
                className="child-form__cancel"
                type="button"
                onClick={handleCancelChild}
              >
                Cancel
              </button>
              <button className="child-form__submit" type="submit" disabled={!canAddChild}>
                Create child
              </button>
            </div>
          </form>
        )}
      </section>
    </aside>
  )
}

function PendingNodeDetails({ node, onDiscard, onSave }) {
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const canSave = title.trim() && question.trim()

  function handleSubmit(event) {
    event.preventDefault()

    if (!canSave) {
      return
    }

    onSave({
      title: title.trim(),
      question: question.trim(),
    })
  }

  return (
    <aside
      className="details-panel pending-details"
      aria-label="New node"
      data-conversation-node-id={node.id}
      data-testid="pending-node-details"
    >
      <header className="details-panel__header">
        <div>
          <p className="details-panel__eyebrow">New node</p>
          <h2>Ask a question</h2>
        </div>
        <button
          className="details-panel__close"
          type="button"
          onClick={onDiscard}
          aria-label="Discard new node"
        >
          ×
        </button>
      </header>

      <form className="pending-node-form" onSubmit={handleSubmit}>
        <p className="pending-node-form__hint">
          {node.data.parentId
            ? 'This node will stay connected to its source after you save it.'
            : 'This node will start a new, independent branch.'}
        </p>

        <div className="child-form__field">
          <label htmlFor={`pending-title-${node.id}`}>Title</label>
          <input
            id={`pending-title-${node.id}`}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Name this question"
            maxLength="120"
            autoFocus
            required
          />
        </div>

        <div className="child-form__field">
          <label htmlFor={`pending-question-${node.id}`}>Question</label>
          <textarea
            id={`pending-question-${node.id}`}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What would you like to understand?"
            rows="5"
            required
          />
        </div>

        <p className="child-form__note">
          This node remains temporary until you create it.
        </p>

        <div className="child-form__actions">
          <button className="child-form__cancel" type="button" onClick={onDiscard}>
            Discard
          </button>
          <button className="child-form__submit" type="submit" disabled={!canSave}>
            Create node
          </button>
        </div>
      </form>
    </aside>
  )
}

function GraphContextMenu({ context, onClose, onDelete }) {
  return (
    <>
      <div
        className="context-menu-backdrop"
        aria-hidden="true"
        onMouseDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        className="graph-context-menu"
        role="menu"
        aria-label={`${context.targetLabel} actions`}
        style={{ left: context.x, top: context.y }}
      >
        <p className="graph-context-menu__target">{context.targetLabel}</p>
        <button type="button" role="menuitem" onClick={onDelete}>
          {context.type === 'node' ? 'Delete node' : 'Delete edge'}
        </button>
        <p className="graph-context-menu__note">{context.description}</p>
      </div>
    </>
  )
}

const nodeTypes = {
  conversation: ConversationNode,
}

const edgeTypes = {
  adjustable: AdjustableEdge,
}

const initialNodes = [
  {
    id: 'freetoken',
    type: 'conversation',
    position: { x: 450, y: 20 },
    data: {
      title: 'FreeToken',
      userMessage: 'What is the FreeToken project and how does it work?',
      assistantMessage:
        'FreeToken improves LLM inference by coordinating CPU, GPU, RAM, and VRAM resources.',
      origin: 'Starting question for this knowledge graph.',
      isRoot: true,
    },
  },
  {
    id: 'cpu',
    type: 'conversation',
    position: { x: 0, y: 330 },
    data: {
      title: 'CPU',
      parentId: 'freetoken',
      sourceTerm: 'CPU',
      sourceMessageRole: 'assistant',
      userMessage: 'What role does the CPU play?',
      assistantMessage:
        'The CPU handles general orchestration and prepares work for accelerators.',
      origin: 'Highlighted from the FreeToken conversation.',
    },
  },
  {
    id: 'gpu',
    type: 'conversation',
    position: { x: 300, y: 330 },
    data: {
      title: 'GPU',
      parentId: 'freetoken',
      sourceTerm: 'GPU',
      sourceMessageRole: 'assistant',
      userMessage: 'Why does FreeToken need a GPU?',
      assistantMessage:
        'The GPU performs highly parallel calculations used during model inference.',
      origin: 'Highlighted from the FreeToken conversation.',
    },
  },
  {
    id: 'ram',
    type: 'conversation',
    position: { x: 600, y: 330 },
    data: {
      title: 'RAM',
      parentId: 'freetoken',
      sourceTerm: 'RAM',
      sourceMessageRole: 'assistant',
      userMessage: 'How is system RAM used?',
      assistantMessage:
        'RAM keeps data readily available to the CPU while the system is running.',
      origin: 'Highlighted from the FreeToken conversation.',
    },
  },
  {
    id: 'vram',
    type: 'conversation',
    position: { x: 900, y: 330 },
    data: {
      title: 'VRAM',
      parentId: 'freetoken',
      sourceTerm: 'VRAM',
      sourceMessageRole: 'assistant',
      userMessage: 'How is VRAM different from RAM?',
      assistantMessage:
        'VRAM is fast memory dedicated to the GPU for model weights and active data.',
      origin: 'Highlighted from the FreeToken conversation.',
    },
  },
]

function createFollowUpEdge(
  source,
  target,
  {
    sourceHandle = 'branch-source',
    targetHandle = 'branch-target-top',
  } = {},
) {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'default',
    data: { relationshipType: 'follow-up' },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
    },
  }
}

function createConnectionPreviewPath(start, end) {
  const direction = end.y >= start.y ? 1 : -1
  const curveOffset = Math.max(48, Math.abs(end.y - start.y) * 0.45)

  return [
    `M ${start.x} ${start.y}`,
    `C ${start.x} ${start.y + curveOffset * direction}`,
    `${end.x} ${end.y - curveOffset * direction}`,
    `${end.x} ${end.y}`,
  ].join(' ')
}

const initialEdges = ['cpu', 'gpu', 'ram', 'vram'].map((target) =>
  createFollowUpEdge('freetoken', target),
)

const graphStorageKey = 'knowflow.graph.v1'
const graphStorageVersion = 1

function cloneInitialGraph() {
  return {
    nodes: initialNodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    })),
    edges: initialEdges.map((edge) => ({
      ...edge,
      data: { ...edge.data },
      markerEnd: { ...edge.markerEnd },
    })),
  }
}

function cloneGraphSnapshot(nodes, edges) {
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

function loadStoredGraph() {
  const fallbackGraph = cloneInitialGraph()

  try {
    const storedValue = window.localStorage.getItem(graphStorageKey)

    if (!storedValue) {
      return fallbackGraph
    }

    const storedGraph = JSON.parse(storedValue)

    if (
      storedGraph?.version !== graphStorageVersion ||
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

    return {
      nodes: storedGraph.nodes.map((storedNode) => {
        const node = { ...storedNode }
        delete node.dragHandle

        return {
          ...node,
          type: 'conversation',
          position: { ...node.position },
          data: { ...node.data },
        }
      }),
      edges: storedGraph.edges.map((edge) => ({
        ...edge,
        sourceHandle: edge.sourceHandle ?? 'branch-source',
        targetHandle: edge.targetHandle ?? 'branch-target-top',
        data: { ...edge.data },
        markerEnd: { ...edge.markerEnd },
      })),
    }
  } catch {
    return fallbackGraph
  }
}

function saveGraph(nodes, edges) {
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

  window.localStorage.setItem(
    graphStorageKey,
    JSON.stringify({
      version: graphStorageVersion,
      nodes: persistableNodes,
      edges: persistableEdges,
    }),
  )
}

function getNextNodeNumber(nodes) {
  const largestStoredNumber = nodes.reduce((largestNumber, node) => {
    const nodeNumber = Number(node.id.match(/^node-(\d+)$/)?.[1])
    return Number.isFinite(nodeNumber) ? Math.max(largestNumber, nodeNumber) : largestNumber
  }, initialNodes.length)

  return largestStoredNumber + 1
}

function getNodeBranchIds(nodes, rootNodeId) {
  const branchIds = new Set([rootNodeId])
  let foundNewChild = true

  while (foundNewChild) {
    foundNewChild = false

    nodes.forEach((node) => {
      if (node.data.parentId && branchIds.has(node.data.parentId) && !branchIds.has(node.id)) {
        branchIds.add(node.id)
        foundNewChild = true
      }
    })
  }

  return branchIds
}

function getStructuralChildId(edge, nodes) {
  const sourceNode = nodes.find((node) => node.id === edge.source)
  const targetNode = nodes.find((node) => node.id === edge.target)

  if (targetNode?.data.parentId === sourceNode?.id) {
    return targetNode.id
  }

  if (sourceNode?.data.parentId === targetNode?.id) {
    return sourceNode.id
  }

  return null
}

function App() {
  const [initialGraph] = useState(loadStoredGraph)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes)
  const [edges, setEdges] = useState(initialGraph.edges)
  const [highlightedSource, setHighlightedSource] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [flowInstance, setFlowInstance] = useState(null)
  const [textSelection, setTextSelection] = useState(null)
  const [childDraft, setChildDraft] = useState(null)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [activeConnectionSourceId, setActiveConnectionSourceId] = useState(null)
  const [canvasAddAction, setCanvasAddAction] = useState(null)
  const [connectionPreview, setConnectionPreview] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [inlineChildDraft, setInlineChildDraft] = useState(null)
  const nextNodeNumber = useRef(getNextNodeNumber(initialGraph.nodes))
  const nextSelectionRequest = useRef(1)
  const clickConnectionSourceId = useRef(null)
  const isClickConnecting = useRef(false)
  const graphPanelRef = useRef(null)
  const graphHistory = useRef([])
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const edgeCurveDrag = useRef({ edgeId: null, historyRecorded: false })
  nodesRef.current = nodes
  edgesRef.current = edges
  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const visibleNodes = nodes.map((node) => {
    if (node.id !== highlightedSource?.parentId) {
      return node
    }

    return {
      ...node,
      data: {
        ...node.data,
        highlightedTerm: highlightedSource.term,
        highlightedRole: highlightedSource.role,
      },
    }
  })
  const visibleEdges = edges.map((edge) => ({
    ...edge,
    type: 'adjustable',
    data: {
      ...edge.data,
      onCurveChange: handleEdgeCurveChange,
      onCurveDragEnd: handleEdgeCurveDragEnd,
      onCurveDragStart: handleEdgeCurveDragStart,
    },
  }))

  useEffect(() => {
    if (!flowInstance) {
      return undefined
    }

    const fitViewTimer = setTimeout(() => {
      flowInstance.fitView({ padding: 0.16 })
    }, 50)

    return () => clearTimeout(fitViewTimer)
  }, [flowInstance, nodes.length, selectedNodeId])

  useEffect(() => {
    setSaveStatus('saving')

    const saveTimer = setTimeout(() => {
      try {
        saveGraph(nodes, edges)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 200)

    return () => clearTimeout(saveTimer)
  }, [nodes, edges])

  useEffect(() => {
    function handleKeyboardShortcut(event) {
      const isEditableTarget = event.target.closest?.(
        'input, textarea, [contenteditable="true"]',
      )
      const isUndoShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z'

      if (isUndoShortcut && !isEditableTarget) {
        if (undoLastGraphChange()) {
          event.preventDefault()
        }
        return
      }

      if (event.key !== 'Escape') {
        return
      }

      clickConnectionSourceId.current = null
      setActiveConnectionSourceId(null)
      setConnectionPreview(null)
      setCanvasAddAction(null)
      setContextMenu(null)
    }

    window.addEventListener('keydown', handleKeyboardShortcut)

    return () => window.removeEventListener('keydown', handleKeyboardShortcut)
  }, [])

  function recordGraphHistory() {
    const snapshot = cloneGraphSnapshot(nodesRef.current, edgesRef.current)

    graphHistory.current = [...graphHistory.current.slice(-49), snapshot]
  }

  function handleEdgeCurveDragStart(edgeId) {
    edgeCurveDrag.current = { edgeId, historyRecorded: false }
    setContextMenu(null)
    setCanvasAddAction(null)
  }

  function handleEdgeCurveChange(edgeId, controlPoint) {
    if (
      edgeCurveDrag.current.edgeId === edgeId &&
      !edgeCurveDrag.current.historyRecorded
    ) {
      recordGraphHistory()
      edgeCurveDrag.current.historyRecorded = true
    }

    setEdges((currentEdges) =>
      currentEdges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              data: {
                ...edge.data,
                controlPoint,
              },
            }
          : edge,
      ),
    )
  }

  function handleEdgeCurveDragEnd(edgeId) {
    if (edgeCurveDrag.current.edgeId === edgeId) {
      edgeCurveDrag.current = { edgeId: null, historyRecorded: false }
    }
  }

  function undoLastGraphChange() {
    const previousGraph = graphHistory.current.pop()

    if (!previousGraph) {
      return false
    }

    const restoredGraph = cloneGraphSnapshot(previousGraph.nodes, previousGraph.edges)

    nodesRef.current = restoredGraph.nodes
    edgesRef.current = restoredGraph.edges
    setNodes(restoredGraph.nodes)
    setEdges(restoredGraph.edges)
    setSelectedNodeId(null)
    setHighlightedSource(null)
    setTextSelection(null)
    setChildDraft(null)
    setInlineChildDraft(null)
    setCanvasAddAction(null)
    setContextMenu(null)
    setConnectionPreview(null)
    setActiveConnectionSourceId(null)
    clickConnectionSourceId.current = null
    isClickConnecting.current = false
    window.getSelection()?.removeAllRanges()

    return true
  }

  function handleConversationSelection(event) {
    const messageElement = event.target.closest('[data-message-role]')
    const nodeElement = event.target.closest('[data-conversation-node-id]')
    const selection = window.getSelection()

    if (
      !messageElement ||
      !nodeElement ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0
    ) {
      setTextSelection(null)
      return
    }

    const selectionText = selection.toString().replace(/\s+/g, ' ').trim()

    if (!selectionText) {
      setTextSelection(null)
      return
    }

    const range = selection.getRangeAt(0)

    if (!messageElement.contains(range.commonAncestorContainer)) {
      setTextSelection(null)
      return
    }

    const selectionRect = range.getBoundingClientRect()
    const actionX = Math.min(
      Math.max(selectionRect.left + selectionRect.width / 2, 92),
      window.innerWidth - 92,
    )
    const actionY = Math.min(selectionRect.bottom + 8, window.innerHeight - 46)

    setTextSelection({
      nodeId: nodeElement.dataset.conversationNodeId,
      role: messageElement.dataset.messageRole,
      text: selectionText.slice(0, 120),
      x: actionX,
      y: actionY,
    })
  }

  function handleSelectionAddChild() {
    if (!textSelection) {
      return
    }

    cancelInlineChildDraft()
    setSelectedNodeId(textSelection.nodeId)
    setChildDraft({
      ...textSelection,
      requestId: nextSelectionRequest.current,
    })
    nextSelectionRequest.current += 1
    setTextSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  function handleNodeClick(nodeId) {
    if (inlineChildDraft?.nodeId === nodeId) {
      return
    }

    if (inlineChildDraft && inlineChildDraft.parentId !== nodeId) {
      cancelInlineChildDraft()
    }

    if (selectedNode?.data.isPending && selectedNode.id !== nodeId) {
      discardPendingNode(selectedNode.id)
    }

    setSelectedNodeId(nodeId)
    setChildDraft(null)
    setCanvasAddAction(null)
    setContextMenu(null)

    if (window.getSelection()?.isCollapsed) {
      setTextSelection(null)
    }
  }

  function startInlineChildDraft(parentId, sourceSelection, initialTitle = '') {
    const parentNode = nodes.find((node) => node.id === parentId)
    const sourceRoleLabel = sourceSelection?.role === 'assistant' ? 'AI' : 'User'

    if (!parentNode || inlineChildDraft?.parentId === parentId) {
      return
    }

    const existingChildren = nodes.filter((node) => node.data.parentId === parentId)

    const childPosition = existingChildren.length
      ? {
          x: Math.max(...existingChildren.map((node) => node.position.x)) + 300,
          y: Math.max(...existingChildren.map((node) => node.position.y)),
        }
      : {
          x: parentNode.position.x,
          y: parentNode.position.y + 330,
        }

    const childId = `node-${nextNodeNumber.current}`
    nextNodeNumber.current += 1

    const childNode = {
      id: childId,
      type: 'conversation',
      position: childPosition,
      data: {
        title: initialTitle || 'New child',
        parentId,
        sourceTerm: sourceSelection?.text,
        sourceMessageRole: sourceSelection?.role,
        userMessage: 'Waiting for your question…',
        assistantMessage: 'This child is a draft.',
        origin: sourceSelection
          ? `Highlighted “${sourceSelection.text}” from the ${parentNode.data.title} ${sourceRoleLabel} message.`
          : `Created manually from the ${parentNode.data.title} node.`,
        isPending: true,
        isInlineDraft: true,
      },
    }

    setNodes((currentNodes) => [...currentNodes, childNode])
    setEdges((currentEdges) => {
      const pendingEdge = createFollowUpEdge(parentId, childId)

      return [
        ...currentEdges,
        {
          ...pendingEdge,
          className: 'pending-edge',
          data: { ...pendingEdge.data, isPending: true },
        },
      ]
    })
    setInlineChildDraft({ nodeId: childId, parentId })
  }

  function removeInlineDraftFromHistory(nodeId) {
    graphHistory.current = graphHistory.current.map((snapshot) => ({
      nodes: snapshot.nodes.filter((node) => node.id !== nodeId),
      edges: snapshot.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    }))
  }

  function cancelInlineChildDraft() {
    if (!inlineChildDraft) {
      return
    }

    const { nodeId } = inlineChildDraft

    removeInlineDraftFromHistory(nodeId)
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== nodeId))
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    )
    setInlineChildDraft(null)
  }

  function completeInlineChildDraft(parentId, childDetails) {
    if (!inlineChildDraft || inlineChildDraft.parentId !== parentId) {
      return
    }

    const { nodeId } = inlineChildDraft
    const graphBeforeChild = cloneGraphSnapshot(
      nodesRef.current.filter((node) => node.id !== nodeId),
      edgesRef.current.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    )

    removeInlineDraftFromHistory(nodeId)
    graphHistory.current = [...graphHistory.current.slice(-49), graphBeforeChild]
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== nodeId) {
          return node
        }

        const stableData = { ...node.data }
        delete stableData.isPending
        delete stableData.isInlineDraft

        return {
          ...node,
          data: {
            ...stableData,
            title: childDetails.title,
            userMessage: childDetails.question,
            assistantMessage: 'No answer yet.',
          },
        }
      }),
    )
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        if (edge.target !== nodeId) {
          return edge
        }

        const stableData = { ...edge.data }
        delete stableData.isPending

        return {
          ...edge,
          className: undefined,
          data: stableData,
        }
      }),
    )
    setInlineChildDraft(null)
    setSelectedNodeId(nodeId)
    setChildDraft(null)
  }

  function createPendingNode(position, parentId = null) {
    const parentNode = parentId ? nodes.find((node) => node.id === parentId) : null

    if (parentId && !parentNode) {
      return
    }

    recordGraphHistory()

    const previousPendingNodeId = selectedNode?.data.isPending ? selectedNode.id : null
    const pendingNodeId = `node-${nextNodeNumber.current}`
    nextNodeNumber.current += 1

    const pendingNode = {
      id: pendingNodeId,
      type: 'conversation',
      position,
      data: {
        title: 'New node',
        parentId: parentId ?? undefined,
        userMessage: 'Waiting for your question…',
        assistantMessage: 'This node is temporary.',
        origin: parentNode
          ? `Created from a new connection from the ${parentNode.data.title} node.`
          : 'Created from the canvas.',
        isPending: true,
      },
    }

    setNodes((currentNodes) => [
      ...currentNodes.filter((node) => node.id !== previousPendingNodeId),
      pendingNode,
    ])
    setEdges((currentEdges) => {
      const stableEdges = currentEdges.filter(
        (edge) =>
          edge.source !== previousPendingNodeId && edge.target !== previousPendingNodeId,
      )

      if (!parentId) {
        return stableEdges
      }

      const pendingEdge = createFollowUpEdge(parentId, pendingNodeId, {
        targetHandle: 'branch-target-bottom',
      })

      return [
        ...stableEdges,
        {
          ...pendingEdge,
          className: 'pending-edge',
          data: {
            ...pendingEdge.data,
            isPending: true,
          },
        },
      ]
    })
    setSelectedNodeId(pendingNodeId)
    setHighlightedSource(null)
    setTextSelection(null)
    setChildDraft(null)
    clickConnectionSourceId.current = null
    setActiveConnectionSourceId(null)
    setConnectionPreview(null)
    setCanvasAddAction(null)
    window.getSelection()?.removeAllRanges()
  }

  function discardPendingNode(nodeId) {
    if (!nodes.some((node) => node.id === nodeId)) {
      return
    }

    recordGraphHistory()
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== nodeId))
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    )
    setSelectedNodeId((currentSelectedNodeId) =>
      currentSelectedNodeId === nodeId ? null : currentSelectedNodeId,
    )
    setChildDraft(null)
    setTextSelection(null)
  }

  function completePendingNode(nodeId, nodeDetails) {
    if (!nodes.some((node) => node.id === nodeId && node.data.isPending)) {
      return
    }

    recordGraphHistory()
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== nodeId || !node.data.isPending) {
          return node
        }

        const stableData = { ...node.data }
        delete stableData.isPending

        return {
          ...node,
          data: {
            ...stableData,
            title: nodeDetails.title,
            userMessage: nodeDetails.question,
            assistantMessage: 'No answer yet.',
          },
        }
      }),
    )
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        if (edge.target !== nodeId || !edge.data?.isPending) {
          return edge
        }

        const stableData = { ...edge.data }
        delete stableData.isPending

        return {
          ...edge,
          className: undefined,
          data: stableData,
        }
      }),
    )
  }

  function handlePaneContextMenu(event) {
    event.preventDefault()

    if (!flowInstance || !graphPanelRef.current) {
      return
    }

    clickConnectionSourceId.current = null
    setActiveConnectionSourceId(null)
    setConnectionPreview(null)
    setContextMenu(null)

    const flowPosition = flowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    const panelBounds = graphPanelRef.current.getBoundingClientRect()

    setCanvasAddAction({
      x: event.clientX - panelBounds.left,
      y: event.clientY - panelBounds.top,
      nodePosition: {
        x: flowPosition.x - 135,
        y: flowPosition.y - 70,
      },
    })
  }

  function handleCanvasAdd() {
    if (!canvasAddAction) {
      return
    }

    createPendingNode(canvasAddAction.nodePosition)
  }

  function handlePaneClick(event) {
    setContextMenu(null)

    if (clickConnectionSourceId.current && flowInstance) {
      const flowPosition = flowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      createPendingNode(
        {
          x: flowPosition.x - 135,
          y: flowPosition.y - 70,
        },
        clickConnectionSourceId.current,
      )
      return
    }

    cancelInlineChildDraft()

    if (canvasAddAction) {
      setCanvasAddAction(null)
    }

    if (selectedNode?.data.isPending) {
      discardPendingNode(selectedNode.id)
      return
    }

    setSelectedNodeId(null)
    setChildDraft(null)
    setTextSelection(null)
  }

  function positionContextMenu(event) {
    return {
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 232)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 140)),
    }
  }

  function handleNodeContextMenu(event, node) {
    event.preventDefault()
    event.stopPropagation()

    cancelInlineChildDraft()

    const branchIds = getNodeBranchIds(nodes, node.id)
    const descendantCount = branchIds.size - 1

    setCanvasAddAction(null)
    setContextMenu({
      ...positionContextMenu(event),
      type: 'node',
      id: node.id,
      targetLabel: node.data.title,
      description: descendantCount
        ? `Also deletes ${descendantCount} child node${descendantCount === 1 ? '' : 's'} and every connected edge.`
        : 'Also deletes every edge connected to this node.',
    })
  }

  function handleEdgeContextMenu(event, edge) {
    event.preventDefault()
    event.stopPropagation()

    cancelInlineChildDraft()

    const childId = getStructuralChildId(edge, nodes)
    const childNode = nodes.find((node) => node.id === childId)
    const branchSize = childId ? getNodeBranchIds(nodes, childId).size : 0

    setCanvasAddAction(null)
    setContextMenu({
      ...positionContextMenu(event),
      type: 'edge',
      id: edge.id,
      childId,
      targetLabel: childId
        ? `${nodes.find((node) => node.id === edge.source)?.data.title ?? 'Parent'} → ${nodes.find((node) => node.id === edge.target)?.data.title ?? 'Child'}`
        : 'Node connection',
      description: childNode
        ? `This is a parent–child edge. Deleting it also deletes ${childNode.data.title}${branchSize > 1 ? ` and its ${branchSize - 1} descendant${branchSize === 2 ? '' : 's'}` : ''}.`
        : 'This is a parallel connection. Only the edge will be deleted.',
    })
  }

  function deleteNodeBranch(rootNodeId) {
    const branchIds = getNodeBranchIds(nodes, rootNodeId)

    recordGraphHistory()

    setNodes((currentNodes) =>
      currentNodes.filter((node) => !branchIds.has(node.id)),
    )
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => !branchIds.has(edge.source) && !branchIds.has(edge.target),
      ),
    )
    setSelectedNodeId((currentNodeId) =>
      branchIds.has(currentNodeId) ? null : currentNodeId,
    )
    setTextSelection((currentSelection) =>
      branchIds.has(currentSelection?.nodeId) ? null : currentSelection,
    )
    setHighlightedSource(null)
    setChildDraft(null)
    setContextMenu(null)
    setConnectionPreview(null)
    setActiveConnectionSourceId(null)
    clickConnectionSourceId.current = null
  }

  function handleContextMenuDelete() {
    if (!contextMenu) {
      return
    }

    if (contextMenu.type === 'node') {
      deleteNodeBranch(contextMenu.id)
      return
    }

    if (contextMenu.childId) {
      deleteNodeBranch(contextMenu.childId)
      return
    }

    recordGraphHistory()
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.id !== contextMenu.id),
    )
    setContextMenu(null)
  }

  function handleConnect(connection) {
    clickConnectionSourceId.current = null
    setActiveConnectionSourceId(null)
    setConnectionPreview(null)

    if (
      !connection.source ||
      !connection.target ||
      connection.source === connection.target
    ) {
      return
    }

    const edgeAlreadyExists = edges.some(
      (edge) =>
        edge.source === connection.source && edge.target === connection.target,
    )

    if (edgeAlreadyExists) {
      return
    }

    recordGraphHistory()
    setEdges((currentEdges) => [
      ...currentEdges,
      createFollowUpEdge(connection.source, connection.target, {
        sourceHandle: connection.sourceHandle ?? 'branch-source',
        targetHandle: connection.targetHandle ?? 'branch-source',
      }),
    ])
  }

  function handleConnectEnd(event, connectionState) {
    if (isClickConnecting.current) {
      return
    }

    if (
      connectionState.isValid ||
      connectionState.toNode ||
      !connectionState.fromNode ||
      !flowInstance
    ) {
      return
    }

    const pointer = 'changedTouches' in event ? event.changedTouches[0] : event

    if (!pointer) {
      return
    }

    const flowPosition = flowInstance.screenToFlowPosition({
      x: pointer.clientX,
      y: pointer.clientY,
    })

    createPendingNode(
      {
        x: flowPosition.x - 135,
        y: flowPosition.y - 70,
      },
      connectionState.fromNode.id,
    )
  }

  function handleClickConnectStart(event, connectionStart) {
    isClickConnecting.current = true
    clickConnectionSourceId.current = connectionStart.nodeId
    setActiveConnectionSourceId(connectionStart.nodeId)
    setCanvasAddAction(null)

    const handleElement = event.target.closest('.node-add-handle')

    if (!handleElement || !graphPanelRef.current) {
      return
    }

    const handleBounds = handleElement.getBoundingClientRect()
    const panelBounds = graphPanelRef.current.getBoundingClientRect()
    const start = {
      x: handleBounds.left + handleBounds.width / 2 - panelBounds.left,
      y: handleBounds.top + handleBounds.height / 2 - panelBounds.top,
    }

    setConnectionPreview({ start, end: start })
  }

  function handleClickConnectEnd() {
    setActiveConnectionSourceId(null)
    setConnectionPreview(null)

    window.setTimeout(() => {
      isClickConnecting.current = false
      clickConnectionSourceId.current = null
    }, 0)
  }

  function handleGraphMouseMove(event) {
    if (!clickConnectionSourceId.current || !graphPanelRef.current) {
      return
    }

    const panelBounds = graphPanelRef.current.getBoundingClientRect()

    setConnectionPreview((currentPreview) =>
      currentPreview
        ? {
            ...currentPreview,
            end: {
              x: event.clientX - panelBounds.left,
              y: event.clientY - panelBounds.top,
            },
          }
        : currentPreview,
    )
  }

  function isValidConnection(connection) {
    return Boolean(
      connection.source &&
        connection.target &&
        connection.source !== connection.target &&
        !edges.some(
          (edge) =>
            edge.source === connection.source && edge.target === connection.target,
        ),
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI-assisted learning workspace</p>
          <h1>KnowFlow</h1>
        </div>
        <div className="app-header__actions">
          <p className="hint">
            Right-click for actions. Use a node’s + to connect. Ctrl/⌘+Z to undo.
          </p>
          <span
            className={`save-status save-status--${saveStatus}`}
            aria-live="polite"
          >
            {saveStatus === 'saving'
              ? 'Saving…'
              : saveStatus === 'error'
                ? 'Could not save'
                : 'Saved locally'}
          </span>
        </div>
      </header>

      <div
        className={`workspace ${selectedNode ? 'workspace--with-details' : ''}`}
        onMouseUp={handleConversationSelection}
      >
        <section
          ref={graphPanelRef}
          className="graph-panel"
          aria-label="KnowFlow knowledge graph"
          onMouseMove={handleGraphMouseMove}
        >
          <ReactFlow
            className={activeConnectionSourceId ? 'react-flow--connecting' : ''}
            nodes={visibleNodes}
            edges={visibleEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={setFlowInstance}
            onNodesChange={onNodesChange}
            onConnect={handleConnect}
            onConnectEnd={handleConnectEnd}
            onClickConnectStart={handleClickConnectStart}
            onClickConnectEnd={handleClickConnectEnd}
            onNodeClick={(event, node) => {
              if (event.target.closest('.react-flow__handle')) {
                return
              }

              handleNodeClick(node.id)
            }}
            onNodeDragStart={() => {
              recordGraphHistory()
              setTextSelection(null)
            }}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            onPaneContextMenu={handlePaneContextMenu}
            onPaneClick={handlePaneClick}
            onNodeMouseEnter={(_, node) => {
              if (node.data.parentId && node.data.sourceTerm) {
                setHighlightedSource({
                  parentId: node.data.parentId,
                  term: node.data.sourceTerm,
                  role: node.data.sourceMessageRole ?? 'assistant',
                })
              }
            }}
            onNodeMouseLeave={() => setHighlightedSource(null)}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.25}
            maxZoom={1.5}
            nodesDraggable
            nodesConnectable
            connectOnClick
            connectionMode={ConnectionMode.Loose}
            connectionRadius={45}
            isValidConnection={isValidConnection}
            nodesFocusable={false}
            edgesFocusable={false}
            deleteKeyCode={null}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.2}
              color="#cbd5e1"
            />
            <Controls showInteractive={false} />
          </ReactFlow>

          {connectionPreview && (
            <svg className="connection-preview" aria-hidden="true">
              <path
                d={createConnectionPreviewPath(
                  connectionPreview.start,
                  connectionPreview.end,
                )}
              />
              <circle
                cx={connectionPreview.end.x}
                cy={connectionPreview.end.y}
                r="4.5"
              />
            </svg>
          )}

          {canvasAddAction && (
            <button
              className="canvas-add-button"
              type="button"
              aria-label="Add node here"
              style={{ left: canvasAddAction.x, top: canvasAddAction.y }}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                handleCanvasAdd()
              }}
            >
              +
            </button>
          )}
        </section>

        {selectedNode?.data.isPending ? (
          <PendingNodeDetails
            key={selectedNode.id}
            node={selectedNode}
            onDiscard={() => discardPendingNode(selectedNode.id)}
            onSave={(nodeDetails) => completePendingNode(selectedNode.id, nodeDetails)}
          />
        ) : selectedNode ? (
          <NodeDetails
            key={`${selectedNode.id}-${childDraft?.requestId ?? 'manual'}`}
            draftNodeId={
              inlineChildDraft?.parentId === selectedNode.id
                ? inlineChildDraft.nodeId
                : null
            }
            initialChildTitle={
              childDraft?.nodeId === selectedNode.id ? childDraft.text : ''
            }
            node={selectedNode}
            onStartChild={({ title }) =>
              startInlineChildDraft(
                selectedNode.id,
                childDraft?.nodeId === selectedNode.id ? childDraft : null,
                title,
              )
            }
            onCancelChild={cancelInlineChildDraft}
            onAddChild={(childDetails) =>
              completeInlineChildDraft(selectedNode.id, childDetails)
            }
            onClose={() => {
              setSelectedNodeId(null)
              setChildDraft(null)
              setTextSelection(null)
            }}
          />
        ) : null}
      </div>

      {textSelection && (
        <button
          className="selection-add-button"
          type="button"
          style={{ left: textSelection.x, top: textSelection.y }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleSelectionAddChild}
        >
          Add child node
        </button>
      )}

      {contextMenu && (
        <GraphContextMenu
          context={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={handleContextMenuDelete}
        />
      )}
    </main>
  )
}

export default App
