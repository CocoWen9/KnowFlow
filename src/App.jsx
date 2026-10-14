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

const aiApiBaseUrl = (import.meta.env.VITE_AI_API_URL ?? '').replace(/\/$/, '')
const aiRequestTimeoutMs = 45_000
const sidebarWidthStorageKey = 'knowflow.sidebar-width.v1'
const defaultSidebarWidth = 256
const minimumSidebarWidth = 200
const maximumSidebarWidth = 420

function clampSidebarWidth(width) {
  return Math.min(maximumSidebarWidth, Math.max(minimumSidebarWidth, width))
}

function loadSidebarWidth() {
  const storedWidth = Number(window.localStorage.getItem(sidebarWidthStorageKey))

  return Number.isFinite(storedWidth)
    ? clampSidebarWidth(storedWidth)
    : defaultSidebarWidth
}

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
      moved: false,
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
    const pointerDelta = {
      x: pointerPosition.x - dragOrigin.current.pointerPosition.x,
      y: pointerPosition.y - dragOrigin.current.pointerPosition.y,
    }

    if (Math.hypot(pointerDelta.x, pointerDelta.y) > 2) {
      dragOrigin.current.moved = true
    }

    data?.onCurveChange?.(id, {
      x: dragOrigin.current.controlPoint.x + pointerDelta.x,
      y: dragOrigin.current.controlPoint.y + pointerDelta.y,
    })
  }

  function finishDragging() {
    if (!dragOrigin.current) {
      return
    }

    const shouldSelectEdge = !dragOrigin.current.moved

    dragOrigin.current = null
    setIsDragging(false)
    data?.onCurveDragEnd?.(id)

    if (shouldSelectEdge) {
      data?.onSelect?.(id)
    }
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
      className={`conversation-card ${data.isRoot ? 'conversation-card--root' : ''} ${data.isPending ? 'conversation-card--pending' : ''} ${data.aiStatus === 'loading' ? 'conversation-card--thinking' : ''} ${data.aiStatus === 'error' ? 'conversation-card--error' : ''}`}
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
        <p aria-live="polite">
          {data.aiStatus === 'loading' && (
            <span className="thinking-dot" aria-hidden="true" />
          )}
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
  onRetry,
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
          <p aria-live="polite">
            {node.data.aiStatus === 'loading' && (
              <span className="thinking-dot" aria-hidden="true" />
            )}
            {node.data.assistantMessage}
          </p>
          {node.data.aiStatus === 'error' && (
            <div className="answer-error">
              <small>{node.data.aiError ?? 'The AI service could not answer.'}</small>
              <button className="retry-answer-button" type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}
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

            <p className="child-form__note">
              The AI will answer after this child is created.
            </p>

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
          This node remains temporary until you create it. The AI answer starts
          after saving.
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

const relationshipOptions = [
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'related-to', label: 'Related to' },
  { value: 'explains', label: 'Explains' },
  { value: 'example-of', label: 'Example of' },
  { value: 'depends-on', label: 'Depends on' },
  { value: 'contradicts', label: 'Contradicts' },
  { value: 'compares-with', label: 'Compares with' },
  { value: 'user-note', label: 'User note' },
]

const relationshipLabels = Object.fromEntries(
  relationshipOptions.map((option) => [option.value, option.label]),
)

const undirectedRelationshipTypes = new Set([
  'related-to',
  'contradicts',
  'compares-with',
  'user-note',
])

function EdgeDetails({ edge, onClose, onSave, sourceNode, targetNode }) {
  const storedRelationshipType = edge.data?.relationshipType ?? 'related-to'
  const storedNote = edge.data?.note ?? ''
  const [relationshipType, setRelationshipType] = useState(storedRelationshipType)
  const [note, setNote] = useState(storedNote)
  const hasChanges =
    relationshipType !== storedRelationshipType || note !== storedNote
  const relationshipLabel =
    relationshipLabels[relationshipType] ?? relationshipLabels['related-to']

  function handleSubmit(event) {
    event.preventDefault()

    if (!hasChanges) {
      return
    }

    const normalizedNote = note.trim()

    setNote(normalizedNote)
    onSave({ relationshipType, note: normalizedNote })
  }

  return (
    <aside
      className="details-panel edge-details"
      aria-label="Edge details"
      data-testid="edge-details"
    >
      <header className="details-panel__header">
        <div>
          <p className="details-panel__eyebrow">Edge details</p>
          <h2>{relationshipLabel}</h2>
        </div>
        <button
          className="details-panel__close"
          type="button"
          onClick={onClose}
          aria-label="Close edge details"
        >
          ×
        </button>
      </header>

      <section className="details-section edge-details__connection">
        <h3>Connection</h3>
        <div className="edge-details__path" aria-label="Connected nodes">
          <span>{sourceNode?.data.title ?? 'Source node'}</span>
          <strong aria-hidden="true">
            {undirectedRelationshipTypes.has(relationshipType) ? '—' : '→'}
          </strong>
          <span>{targetNode?.data.title ?? 'Target node'}</span>
        </div>
      </section>

      <form className="edge-details__form" onSubmit={handleSubmit}>
        <div className="child-form__field">
          <label htmlFor={`edge-relationship-${edge.id}`}>Relationship</label>
          <select
            id={`edge-relationship-${edge.id}`}
            value={relationshipType}
            onChange={(event) => setRelationshipType(event.target.value)}
          >
            {relationshipOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="child-form__field">
          <label htmlFor={`edge-note-${edge.id}`}>Note</label>
          <textarea
            id={`edge-note-${edge.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Describe why these ideas are connected."
            rows="6"
            maxLength="800"
          />
        </div>

        <p className="child-form__note">
          Relationship and note are semantic. Dragging the curve only changes its
          visual shape.
        </p>

        <div className="child-form__actions">
          <button
            className="child-form__submit"
            type="submit"
            disabled={!hasChanges}
          >
            Save changes
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
          {context.type === 'node'
            ? 'Delete node'
            : context.type === 'graph'
              ? 'Delete graph'
              : 'Delete edge'}
        </button>
        <p className="graph-context-menu__note">{context.description}</p>
      </div>
    </>
  )
}

function AppIcon({ name }) {
  const paths = {
    panel: <path d="M4 5h16v14H4zM9 5v14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <path d="m20 20-4.2-4.2M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />,
    graph: <path d="M6 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8 7h4a4 4 0 0 1 4 4v4M6 9v6a2 2 0 0 0 2 2h8" />,
    pin: <path d="m9 4 6 0-.8 5 2.8 3H7l2.8-3L9 4Zm3 8v8" />,
    user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />,
    arrow: <path d="m9 18 6-6-6-6" />,
  }

  return (
    <svg
      className="app-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function GraphSidebar({
  activeGraphId,
  collapsed,
  graphs,
  onCreateGraph,
  onDeleteGraph,
  onSelectGraph,
  onToggleGraphPin,
  onToggle,
}) {
  const [query, setQuery] = useState('')
  const [showAccountNote, setShowAccountNote] = useState(false)
  const [graphContextMenu, setGraphContextMenu] = useState(null)
  const sortedGraphs = [...graphs].sort((first, second) => {
    const pinnedDifference =
      Number(Boolean(second.pinned)) - Number(Boolean(first.pinned))

    if (pinnedDifference) {
      return pinnedDifference
    }

    return (
      new Date(second.updatedAt).getTime() -
      new Date(first.updatedAt).getTime()
    )
  })
  const visibleGraphs = sortedGraphs.filter((graph) =>
    getGraphSummary(graph).toLowerCase().includes(query.trim().toLowerCase()),
  )
  const pinnedGraphs = visibleGraphs.filter((graph) => graph.pinned)
  const recentGraphs = visibleGraphs.filter((graph) => !graph.pinned)

  function renderGraphRow(graph) {
    const graphSummary = getGraphSummary(graph)

    return (
      <div
        key={graph.id}
        className="graph-list__row"
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setGraphContextMenu({
            type: 'graph',
            graphId: graph.id,
            targetLabel: graphSummary,
            description: 'Deletes this graph from this device.',
            x: Math.max(
              12,
              Math.min(event.clientX, window.innerWidth - 232),
            ),
            y: Math.max(
              12,
              Math.min(event.clientY, window.innerHeight - 132),
            ),
          })
        }}
      >
        <button
          className={`graph-list__item ${graph.id === activeGraphId ? 'graph-list__item--active' : ''}`}
          type="button"
          onClick={() => onSelectGraph(graph.id)}
          aria-current={graph.id === activeGraphId ? 'page' : undefined}
        >
          <AppIcon name="graph" />
          <span>
            <strong>
              {graph.id === 'local-freetoken' ? 'Example: ' : ''}
              {graphSummary}
            </strong>
            <small>
              {graph.nodes.length} node{graph.nodes.length === 1 ? '' : 's'}
            </small>
          </span>
        </button>
        <button
          className={`graph-pin-button ${graph.pinned ? 'graph-pin-button--active' : ''}`}
          type="button"
          aria-label={
            graph.pinned ? `Unpin ${graphSummary}` : `Pin ${graphSummary}`
          }
          aria-pressed={Boolean(graph.pinned)}
          title={graph.pinned ? 'Unpin graph' : 'Pin graph'}
          onClick={(event) => {
            event.stopPropagation()
            onToggleGraphPin(graph.id)
          }}
        >
          <AppIcon name="pin" />
        </button>
      </div>
    )
  }

  return (
    <aside className={`graph-sidebar ${collapsed ? 'graph-sidebar--collapsed' : ''}`}>
      <div className="graph-sidebar__topbar">
        <button
          className="graph-sidebar__brand"
          type="button"
          onClick={collapsed ? onToggle : undefined}
          aria-label={collapsed ? 'Open sidebar' : 'KnowFlow home'}
        >
          <span aria-hidden="true">K</span>
          {!collapsed && <strong>KnowFlow</strong>}
        </button>
        {!collapsed && (
          <button
            className="sidebar-icon-button"
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
          >
            <AppIcon name="panel" />
          </button>
        )}
      </div>

      <div className="graph-sidebar__primary-actions">
        <button
          className="sidebar-action"
          type="button"
          onClick={onCreateGraph}
          title={collapsed ? 'New graph' : undefined}
        >
          <AppIcon name="plus" />
          {!collapsed && <span>New graph</span>}
        </button>
        <label
          className="sidebar-search"
          title={collapsed ? 'Search graphs' : undefined}
        >
          <AppIcon name="search" />
          {!collapsed && (
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search graphs"
              aria-label="Search graphs"
            />
          )}
        </label>
      </div>

      {!collapsed && (
        <div className="graph-sidebar__library">
          <nav className="graph-list" aria-label="Local knowledge graphs">
            {pinnedGraphs.length > 0 && (
              <div className="graph-list__section">
                <div className="graph-sidebar__section-heading">Pinned</div>
                {pinnedGraphs.map(renderGraphRow)}
              </div>
            )}

            {recentGraphs.length > 0 && (
              <div className="graph-list__section">
                <div className="graph-sidebar__section-heading">Recents</div>
                {recentGraphs.map(renderGraphRow)}
              </div>
            )}

            {!visibleGraphs.length && (
              <p className="graph-list__empty">No local graphs match your search.</p>
            )}
          </nav>
        </div>
      )}

      <div className="graph-sidebar__account">
        {showAccountNote && !collapsed && (
          <div className="account-note" role="status">
            <strong>Local workspace</strong>
            <p>Sign in to sync your graphs across devices.</p>
          </div>
        )}
        <button
          className="account-button"
          type="button"
          onClick={() => {
            if (collapsed) {
              onToggle()
              return
            }

            setShowAccountNote((currentValue) => !currentValue)
          }}
          title={collapsed ? 'Guest account' : undefined}
        >
          <span className="account-button__avatar" aria-hidden="true">
            <AppIcon name="user" />
          </span>
          {!collapsed && (
            <span className="account-button__copy">
              <strong>Log in</strong>
              <small>Guest · Local only</small>
            </span>
          )}
          {!collapsed && <AppIcon name="arrow" />}
        </button>
      </div>

      {graphContextMenu && (
        <GraphContextMenu
          context={graphContextMenu}
          onClose={() => setGraphContextMenu(null)}
          onDelete={() => {
            onDeleteGraph(graphContextMenu.graphId)
            setGraphContextMenu(null)
          }}
        />
      )}
    </aside>
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
    note = '',
    relationshipType = 'follow-up',
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
    data: { relationshipType, note },
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
const graphStorageVersion = 2

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

function getPersistableGraph(nodes, edges) {
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

function saveGraph(nodes, edges) {
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

function createGraphId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }

  return `graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeLibraryGraph(graph) {
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

function loadGraphLibrary() {
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

  const migratedGraph = loadStoredGraph()
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

function saveGraphLibrary(graphs, activeGraphId) {
  window.localStorage.setItem(
    graphLibraryStorageKey,
    JSON.stringify({
      version: graphLibraryStorageVersion,
      activeGraphId,
      graphs,
    }),
  )
}

function getGraphSummary(graph) {
  const rootNode =
    graph.nodes.find((node) => node.data.isRoot) ??
    graph.nodes.find((node) => !node.data.parentId)

  if (!rootNode) {
    return 'Untitled graph'
  }

  const assistantSummary = rootNode.data.assistantMessage?.trim()

  if (
    assistantSummary &&
    assistantSummary !== 'Thinking…' &&
    assistantSummary !== 'This node is temporary.'
  ) {
    return assistantSummary
  }

  return rootNode.data.userMessage?.trim() || rootNode.data.title || 'Untitled graph'
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
  const [initialLibrary] = useState(loadGraphLibrary)
  const [graphLibrary, setGraphLibrary] = useState(initialLibrary.graphs)
  const [activeGraphId, setActiveGraphId] = useState(initialLibrary.activeGraphId)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const initialGraph =
    initialLibrary.graphs.find((graph) => graph.id === initialLibrary.activeGraphId) ??
    initialLibrary.graphs[0]
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes)
  const [edges, setEdges] = useState(initialGraph.edges)
  const [highlightedSource, setHighlightedSource] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState(null)
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
  const sidebarResize = useRef(null)
  nodesRef.current = nodes
  edgesRef.current = edges
  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId)
  const selectedEdgeSource = nodes.find(
    (node) => node.id === selectedEdge?.source,
  )
  const selectedEdgeTarget = nodes.find(
    (node) => node.id === selectedEdge?.target,
  )
  const activeRootNode =
    nodes.find((node) => node.data.isRoot) ??
    nodes.find((node) => !node.data.parentId)
  const activeGraphHeading = activeRootNode?.data.title ?? 'Untitled graph'
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
  const visibleEdges = edges.map((edge) => {
    const relationshipType = edge.data?.relationshipType ?? 'related-to'
    const isSelected = edge.id === selectedEdgeId
    const isSemanticRelationship = relationshipType !== 'follow-up'
    const usesArrow = !undirectedRelationshipTypes.has(relationshipType)

    return {
      ...edge,
      type: 'adjustable',
      selected: isSelected,
      markerEnd: usesArrow
        ? edge.markerEnd ?? {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
          }
        : undefined,
      style: {
        ...edge.style,
        strokeDasharray: isSemanticRelationship ? '7 6' : undefined,
        stroke: isSelected ? '#4669e8' : undefined,
        strokeWidth: isSelected ? 2.6 : undefined,
      },
      data: {
        ...edge.data,
        onCurveChange: handleEdgeCurveChange,
        onCurveDragEnd: handleEdgeCurveDragEnd,
        onCurveDragStart: handleEdgeCurveDragStart,
        onSelect: handleEdgeSelect,
      },
    }
  })

  useEffect(() => {
    if (!flowInstance) {
      return undefined
    }

    const fitViewTimer = setTimeout(() => {
      flowInstance.fitView({ padding: 0.16 })
    }, 50)

    return () => clearTimeout(fitViewTimer)
  }, [activeGraphId, flowInstance, nodes.length, selectedNodeId, selectedEdgeId])

  useEffect(() => {
    setSaveStatus('saving')

    const saveTimer = setTimeout(() => {
      try {
        saveGraph(nodes, edges)
        const persistableGraph = getPersistableGraph(nodes, edges)
        const now = new Date().toISOString()

        setGraphLibrary((currentGraphs) => {
          const updatedGraphs = currentGraphs.map((graph) =>
            graph.id === activeGraphId
              ? {
                  ...graph,
                  ...persistableGraph,
                  updatedAt: now,
                }
              : graph,
          )

          saveGraphLibrary(updatedGraphs, activeGraphId)
          return updatedGraphs
        })
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 200)

    return () => clearTimeout(saveTimer)
  }, [activeGraphId, nodes, edges])

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

  function openLocalGraph(graph, nextGraphs) {
    const snapshot = cloneGraphSnapshot(graph.nodes, graph.edges)

    saveGraphLibrary(nextGraphs, graph.id)
    setGraphLibrary(nextGraphs)
    setActiveGraphId(graph.id)
    nodesRef.current = snapshot.nodes
    edgesRef.current = snapshot.edges
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
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
    graphHistory.current = []
    nextNodeNumber.current = getNextNodeNumber(snapshot.nodes)
    window.getSelection()?.removeAllRanges()
  }

  function getLibraryWithCurrentGraph() {
    const persistableGraph = getPersistableGraph(
      nodesRef.current,
      edgesRef.current,
    )
    const now = new Date().toISOString()

    return graphLibrary.map((graph) =>
      graph.id === activeGraphId
        ? {
            ...graph,
            ...persistableGraph,
            updatedAt: now,
          }
        : graph,
    )
  }

  function handleSelectGraph(graphId) {
    if (graphId === activeGraphId) {
      return
    }

    const nextGraphs = getLibraryWithCurrentGraph()
    const nextGraph = nextGraphs.find((graph) => graph.id === graphId)

    if (!nextGraph) {
      return
    }

    openLocalGraph(nextGraph, nextGraphs)
  }

  function handleCreateGraph() {
    const now = new Date().toISOString()
    const newGraph = {
      id: createGraphId(),
      pinned: false,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
    }
    const nextGraphs = [...getLibraryWithCurrentGraph(), newGraph]

    openLocalGraph(newGraph, nextGraphs)
  }

  function handleToggleGraphPin(graphId) {
    const nextGraphs = getLibraryWithCurrentGraph().map((graph) =>
      graph.id === graphId
        ? {
            ...graph,
            pinned: !graph.pinned,
          }
        : graph,
    )

    setGraphLibrary(nextGraphs)
    saveGraphLibrary(nextGraphs, activeGraphId)
  }

  function handleDeleteGraph(graphId) {
    let nextGraphs = getLibraryWithCurrentGraph().filter(
      (graph) => graph.id !== graphId,
    )

    if (!nextGraphs.length) {
      const now = new Date().toISOString()
      nextGraphs = [
        {
          id: createGraphId(),
          pinned: false,
          createdAt: now,
          updatedAt: now,
          nodes: [],
          edges: [],
        },
      ]
    }

    if (graphId === activeGraphId) {
      const nextGraph = [...nextGraphs].sort((first, second) => {
        const pinnedDifference =
          Number(Boolean(second.pinned)) - Number(Boolean(first.pinned))

        if (pinnedDifference) {
          return pinnedDifference
        }

        return (
          new Date(second.updatedAt).getTime() -
          new Date(first.updatedAt).getTime()
        )
      })[0]

      openLocalGraph(nextGraph, nextGraphs)
      return
    }

    setGraphLibrary(nextGraphs)
    saveGraphLibrary(nextGraphs, activeGraphId)
  }

  async function requestAiAnswer(nodeId, nodeSnapshot = null) {
    const node =
      nodeSnapshot ?? nodesRef.current.find((candidate) => candidate.id === nodeId)

    if (!node || node.data.isPending) {
      return
    }

    const parentNode = node.data.parentId
      ? nodesRef.current.find((candidate) => candidate.id === node.data.parentId)
      : null

    setNodes((currentNodes) =>
      currentNodes.map((currentNode) =>
        currentNode.id === nodeId
          ? {
              ...currentNode,
              data: {
                ...currentNode.data,
                aiStatus: 'loading',
                assistantMessage: 'Thinking…',
                aiError: undefined,
              },
            }
          : currentNode,
      ),
    )

    const requestController = new AbortController()
    const timeout = window.setTimeout(
      () => requestController.abort(),
      aiRequestTimeoutMs,
    )

    try {
      if (!aiApiBaseUrl) {
        throw new Error('The AI service is not configured yet.')
      }

      const response = await fetch(`${aiApiBaseUrl}/api/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: requestController.signal,
        body: JSON.stringify({
          title: node.data.title,
          question: node.data.userMessage,
          source: node.data.sourceTerm
            ? {
                text: node.data.sourceTerm,
                role: node.data.sourceMessageRole ?? 'assistant',
              }
            : null,
          parentConversation: parentNode
            ? {
                title: parentNode.data.title,
                userMessage: parentNode.data.userMessage,
                assistantMessage: parentNode.data.assistantMessage,
              }
            : null,
        }),
      })
      const responseBody = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(responseBody?.error ?? 'The AI service could not answer.')
      }

      const answer = responseBody?.answer?.trim()

      if (!answer) {
        throw new Error('The AI service returned an empty answer.')
      }

      setNodes((currentNodes) =>
        currentNodes.map((currentNode) =>
          currentNode.id === nodeId
            ? {
                ...currentNode,
                data: {
                  ...currentNode.data,
                  aiStatus: 'complete',
                  assistantMessage: answer,
                  aiError: undefined,
                },
              }
            : currentNode,
        ),
      )
    } catch (error) {
      const message =
        error.name === 'AbortError'
          ? 'The AI request timed out.'
          : error.message || 'The AI service could not answer.'

      setNodes((currentNodes) =>
        currentNodes.map((currentNode) =>
          currentNode.id === nodeId
            ? {
                ...currentNode,
                data: {
                  ...currentNode.data,
                  aiStatus: 'error',
                  assistantMessage: 'Couldn’t generate an answer.',
                  aiError: message,
                },
              }
            : currentNode,
        ),
      )
    } finally {
      window.clearTimeout(timeout)
    }
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

  function handleEdgeSelect(edgeId) {
    const edge = edgesRef.current.find((candidate) => candidate.id === edgeId)

    if (!edge || edge.data?.isPending) {
      return
    }

    cancelInlineChildDraft()

    if (selectedNode?.data.isPending) {
      discardPendingNode(selectedNode.id)
    }

    setSelectedNodeId(null)
    setSelectedEdgeId(edgeId)
    setChildDraft(null)
    setTextSelection(null)
    setCanvasAddAction(null)
    setContextMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  function handleEdgeDetailsSave(edgeId, edgeDetails) {
    const edge = edgesRef.current.find((candidate) => candidate.id === edgeId)
    const relationshipType = relationshipOptions.some(
      (option) => option.value === edgeDetails.relationshipType,
    )
      ? edgeDetails.relationshipType
      : 'related-to'
    const note = edgeDetails.note.trim().slice(0, 800)

    if (
      !edge ||
      (edge.data?.relationshipType === relationshipType &&
        (edge.data?.note ?? '') === note)
    ) {
      return
    }

    recordGraphHistory()
    setEdges((currentEdges) =>
      currentEdges.map((currentEdge) =>
        currentEdge.id === edgeId
          ? {
              ...currentEdge,
              data: {
                ...currentEdge.data,
                relationshipType,
                note,
              },
            }
          : currentEdge,
      ),
    )
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
    setSelectedEdgeId(null)
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
    setSelectedEdgeId(null)
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
    setSelectedEdgeId(null)
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
    const draftNode = nodesRef.current.find((node) => node.id === nodeId)

    if (!draftNode) {
      return
    }

    const stableData = { ...draftNode.data }
    delete stableData.isPending
    delete stableData.isInlineDraft
    const completedNode = {
      ...draftNode,
      data: {
        ...stableData,
        title: childDetails.title,
        userMessage: childDetails.question,
        assistantMessage: 'Thinking…',
        aiStatus: 'loading',
      },
    }
    const graphBeforeChild = cloneGraphSnapshot(
      nodesRef.current.filter((node) => node.id !== nodeId),
      edgesRef.current.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    )

    removeInlineDraftFromHistory(nodeId)
    graphHistory.current = [...graphHistory.current.slice(-49), graphBeforeChild]
    setNodes((currentNodes) =>
      currentNodes.map((node) => (node.id === nodeId ? completedNode : node)),
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
    void requestAiAnswer(nodeId, completedNode)
  }

  function createPendingNode(position, parentId = null) {
    const parentNode = parentId ? nodes.find((node) => node.id === parentId) : null
    const isFirstRootNode =
      !parentId && !nodes.some((node) => !node.data.isPending)

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
        isRoot: isFirstRootNode || undefined,
        userMessage: 'Waiting for your question…',
        assistantMessage: 'This node is temporary.',
        origin: parentNode
          ? `Created from a new connection from the ${parentNode.data.title} node.`
          : isFirstRootNode
            ? 'Starting question for this knowledge graph.'
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
    setSelectedEdgeId(null)
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
    const pendingNode = nodesRef.current.find(
      (node) => node.id === nodeId && node.data.isPending,
    )

    if (!pendingNode) {
      return
    }

    recordGraphHistory()
    const stableData = { ...pendingNode.data }
    delete stableData.isPending
    const completedNode = {
      ...pendingNode,
      data: {
        ...stableData,
        title: nodeDetails.title,
        userMessage: nodeDetails.question,
        assistantMessage: 'Thinking…',
        aiStatus: 'loading',
      },
    }
    setNodes((currentNodes) =>
      currentNodes.map((node) => (node.id === nodeId ? completedNode : node)),
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
    void requestAiAnswer(nodeId, completedNode)
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
    setSelectedEdgeId(null)
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
    setSelectedEdgeId((currentEdgeId) => {
      const currentEdge = edgesRef.current.find(
        (edge) => edge.id === currentEdgeId,
      )

      return currentEdge &&
        (branchIds.has(currentEdge.source) || branchIds.has(currentEdge.target))
        ? null
        : currentEdgeId
    })
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
    setSelectedEdgeId((currentEdgeId) =>
      currentEdgeId === contextMenu.id ? null : currentEdgeId,
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

    const newEdge = createFollowUpEdge(connection.source, connection.target, {
      relationshipType: 'related-to',
      sourceHandle: connection.sourceHandle ?? 'branch-source',
      targetHandle: connection.targetHandle ?? 'branch-source',
    })

    recordGraphHistory()
    setEdges((currentEdges) => [...currentEdges, newEdge])
    setSelectedNodeId(null)
    setSelectedEdgeId(newEdge.id)
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

  function beginSidebarResize(event) {
    if (isSidebarCollapsed || event.button !== 0) {
      return
    }

    event.preventDefault()
    sidebarResize.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
      lastWidth: sidebarWidth,
    }
    setIsResizingSidebar(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function updateSidebarWidth(event) {
    if (!sidebarResize.current) {
      return
    }

    event.preventDefault()
    const nextWidth = clampSidebarWidth(
      sidebarResize.current.startWidth +
        event.clientX -
        sidebarResize.current.startX,
    )

    sidebarResize.current.lastWidth = nextWidth
    setSidebarWidth(nextWidth)
  }

  function finishSidebarResize() {
    if (!sidebarResize.current) {
      return
    }

    const finalWidth = sidebarResize.current.lastWidth

    sidebarResize.current = null
    setIsResizingSidebar(false)
    window.localStorage.setItem(sidebarWidthStorageKey, String(finalWidth))
  }

  function handleSidebarResizeKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }

    event.preventDefault()
    const nextWidth = clampSidebarWidth(
      sidebarWidth + (event.key === 'ArrowLeft' ? -12 : 12),
    )

    setSidebarWidth(nextWidth)
    window.localStorage.setItem(sidebarWidthStorageKey, String(nextWidth))
  }

  function resetSidebarWidth() {
    setSidebarWidth(defaultSidebarWidth)
    window.localStorage.setItem(
      sidebarWidthStorageKey,
      String(defaultSidebarWidth),
    )
  }

  return (
    <div
      className={`app-layout ${isSidebarCollapsed ? 'app-layout--sidebar-collapsed' : ''} ${isResizingSidebar ? 'app-layout--resizing-sidebar' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` }}
    >
      <GraphSidebar
        activeGraphId={activeGraphId}
        collapsed={isSidebarCollapsed}
        graphs={graphLibrary}
        onCreateGraph={handleCreateGraph}
        onDeleteGraph={handleDeleteGraph}
        onSelectGraph={handleSelectGraph}
        onToggleGraphPin={handleToggleGraphPin}
        onToggle={() => setIsSidebarCollapsed((currentValue) => !currentValue)}
      />

      {!isSidebarCollapsed && (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-label="Resize graph sidebar"
          aria-orientation="vertical"
          aria-valuemin={minimumSidebarWidth}
          aria-valuemax={maximumSidebarWidth}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={beginSidebarResize}
          onPointerMove={updateSidebarWidth}
          onPointerUp={finishSidebarResize}
          onLostPointerCapture={finishSidebarResize}
          onKeyDown={handleSidebarResizeKeyDown}
          onDoubleClick={resetSidebarWidth}
        />
      )}

      <main className="app-shell">
      <header className="app-header">
        <div className="app-header__title">
          <h1>
            {activeGraphId === 'local-freetoken' ? 'Example: ' : ''}
            {activeGraphHeading}
          </h1>
          <span>Local</span>
        </div>
        <div className="app-header__actions">
          <span
            className={`save-status save-status--${saveStatus}`}
            aria-live="polite"
          >
            {saveStatus === 'saving'
              ? 'Saving…'
              : saveStatus === 'error'
                ? 'Could not save'
                : 'Saved on this device'}
          </span>
        </div>
      </header>

      <div
        className={`workspace ${selectedNode || selectedEdge ? 'workspace--with-details' : ''}`}
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
            onEdgeClick={(_, edge) => handleEdgeSelect(edge.id)}
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

          {!nodes.length && (
            <div className="empty-graph" aria-live="polite">
              <h2>New graph</h2>
              <p>Right-click the canvas and choose + to add the first conversation.</p>
            </div>
          )}

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
              <AppIcon name="plus" />
            </button>
          )}
        </section>

        {selectedEdge ? (
          <EdgeDetails
            key={selectedEdge.id}
            edge={selectedEdge}
            sourceNode={selectedEdgeSource}
            targetNode={selectedEdgeTarget}
            onSave={(edgeDetails) =>
              handleEdgeDetailsSave(selectedEdge.id, edgeDetails)
            }
            onClose={() => setSelectedEdgeId(null)}
          />
        ) : selectedNode?.data.isPending ? (
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
            onRetry={() => requestAiAnswer(selectedNode.id)}
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
    </div>
  )
}

export default App
