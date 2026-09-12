import { useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
} from '@xyflow/react'

function ConversationNode({ id, data }) {
  return (
    <article
      className={`conversation-card ${data.isRoot ? 'conversation-card--root' : ''}`}
      data-conversation-node-id={id}
    >
      <Handle type="target" position={Position.Top} />

      <header className="conversation-card__header">
        <span className="conversation-card__icon" aria-hidden="true">
          {data.isRoot ? 'K' : '↳'}
        </span>
        <h2>{data.title}</h2>
      </header>

      <div className="message message--user nodrag" data-message-role="user">
        <span>User</span>
        <p>
          <HighlightedText
            text={data.userMessage}
            term={data.highlightedRole === 'user' ? data.highlightedTerm : null}
          />
        </p>
      </div>

      <div className="message message--assistant nodrag" data-message-role="assistant">
        <span>AI</span>
        <p>
          <HighlightedText
            text={data.assistantMessage}
            term={data.highlightedRole === 'assistant' ? data.highlightedTerm : null}
          />
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} />
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

function NodeDetails({ initialChildTitle, node, onAddChild, onClose }) {
  const [isAddingChild, setIsAddingChild] = useState(Boolean(initialChildTitle))
  const [childTitle, setChildTitle] = useState(initialChildTitle ?? '')
  const [childQuestion, setChildQuestion] = useState('')
  const canAddChild = childTitle.trim() && childQuestion.trim()

  function handleSubmit(event) {
    event.preventDefault()

    if (!canAddChild) {
      return
    }

    onAddChild({
      title: childTitle.trim(),
      question: childQuestion.trim(),
    })
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
        <button className="details-panel__close" type="button" onClick={onClose} aria-label="Close details">
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
            onClick={() => setIsAddingChild(true)}
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
                onClick={() => setIsAddingChild(false)}
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

const nodeTypes = {
  conversation: ConversationNode,
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
].map((node) => ({
  ...node,
  dragHandle: '.conversation-card__header',
}))

function createFollowUpEdge(source, target) {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: 'default',
    data: { relationshipType: 'follow-up' },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
    },
  }
}

const initialEdges = ['cpu', 'gpu', 'ram', 'vram'].map((target) =>
  createFollowUpEdge('freetoken', target),
)

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [highlightedSource, setHighlightedSource] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [flowInstance, setFlowInstance] = useState(null)
  const [textSelection, setTextSelection] = useState(null)
  const [childDraft, setChildDraft] = useState(null)
  const nextNodeNumber = useRef(initialNodes.length + 1)
  const nextSelectionRequest = useRef(1)
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

  useEffect(() => {
    if (!flowInstance) {
      return undefined
    }

    const fitViewTimer = setTimeout(() => {
      flowInstance.fitView({ padding: 0.16 })
    }, 50)

    return () => clearTimeout(fitViewTimer)
  }, [flowInstance, nodes.length, selectedNodeId])

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
    setSelectedNodeId(nodeId)
    setChildDraft(null)

    if (window.getSelection()?.isCollapsed) {
      setTextSelection(null)
    }
  }

  function handleAddChild(parentId, childDetails, sourceSelection) {
    const parentNode = nodes.find((node) => node.id === parentId)
    const sourceRoleLabel = sourceSelection?.role === 'assistant' ? 'AI' : 'User'

    if (!parentNode) {
      return
    }

    const existingChildren = edges
      .filter((edge) => edge.source === parentId)
      .map((edge) => nodes.find((node) => node.id === edge.target))
      .filter(Boolean)

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
      dragHandle: '.conversation-card__header',
      position: childPosition,
      data: {
        title: childDetails.title,
        parentId,
        sourceTerm: sourceSelection?.text,
        sourceMessageRole: sourceSelection?.role,
        userMessage: childDetails.question,
        assistantMessage: 'No answer yet.',
        origin: sourceSelection
          ? `Highlighted “${sourceSelection.text}” from the ${parentNode.data.title} ${sourceRoleLabel} message.`
          : `Created manually from the ${parentNode.data.title} node.`,
      },
    }

    setNodes((currentNodes) => [...currentNodes, childNode])
    setEdges((currentEdges) => [...currentEdges, createFollowUpEdge(parentId, childId)])
    setSelectedNodeId(childId)
    setChildDraft(null)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI-assisted learning workspace</p>
          <h1>KnowFlow</h1>
        </div>
        <p className="hint">Click to inspect. Select text to branch. Drag a node header to organize.</p>
      </header>

      <div
        className={`workspace ${selectedNode ? 'workspace--with-details' : ''}`}
        onMouseUp={handleConversationSelection}
      >
        <section className="graph-panel" aria-label="KnowFlow knowledge graph">
          <ReactFlow
            nodes={visibleNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setFlowInstance}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => handleNodeClick(node.id)}
            onNodeDragStart={() => setTextSelection(null)}
            onPaneClick={() => {
              setSelectedNodeId(null)
              setChildDraft(null)
              setTextSelection(null)
            }}
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
            nodesConnectable={false}
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
        </section>

        {selectedNode && (
          <NodeDetails
            key={`${selectedNode.id}-${childDraft?.requestId ?? 'manual'}`}
            initialChildTitle={
              childDraft?.nodeId === selectedNode.id ? childDraft.text : ''
            }
            node={selectedNode}
            onAddChild={(childDetails) =>
              handleAddChild(
                selectedNode.id,
                childDetails,
                childDraft?.nodeId === selectedNode.id ? childDraft : null,
              )
            }
            onClose={() => {
              setSelectedNodeId(null)
              setChildDraft(null)
              setTextSelection(null)
            }}
          />
        )}
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
    </main>
  )
}

export default App
