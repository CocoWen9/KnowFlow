import { useEffect, useState } from 'react'
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

function ConversationNode({ data }) {
  return (
    <article className={`conversation-card ${data.isRoot ? 'conversation-card--root' : ''}`}>
      <Handle type="target" position={Position.Top} />

      <header className="conversation-card__header">
        <span className="conversation-card__icon" aria-hidden="true">
          {data.isRoot ? 'K' : '↳'}
        </span>
        <h2>{data.title}</h2>
      </header>

      <div className="message message--user">
        <span>User</span>
        <p>{data.userMessage}</p>
      </div>

      <div className="message message--assistant">
        <span>AI</span>
        <p>
          <HighlightedText text={data.assistantMessage} term={data.highlightedTerm} />
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

function NodeDetails({ node, onClose }) {
  return (
    <aside className="details-panel" aria-label="Node details" data-testid="node-details">
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

      <section className="details-section">
        <h3>Conversation</h3>
        <div className="details-message details-message--user">
          <span>User</span>
          <p>{node.data.userMessage}</p>
        </div>
        <div className="details-message details-message--assistant">
          <span>AI</span>
          <p>{node.data.assistantMessage}</p>
        </div>
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
      userMessage: 'How is VRAM different from RAM?',
      assistantMessage:
        'VRAM is fast memory dedicated to the GPU for model weights and active data.',
      origin: 'Highlighted from the FreeToken conversation.',
    },
  },
]

const initialEdges = ['cpu', 'gpu', 'ram', 'vram'].map((target) => ({
  id: `freetoken-${target}`,
  source: 'freetoken',
  target,
  type: 'default',
  data: { relationshipType: 'follow-up' },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
  },
}))

function App() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [highlightedSource, setHighlightedSource] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [flowInstance, setFlowInstance] = useState(null)
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
      },
    }
  })

  useEffect(() => {
    if (!flowInstance) {
      return undefined
    }

    const frame = requestAnimationFrame(() => {
      flowInstance.fitView({ padding: 0.16 })
    })

    return () => cancelAnimationFrame(frame)
  }, [flowInstance, selectedNodeId])

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI-assisted learning workspace</p>
          <h1>KnowFlow</h1>
        </div>
        <p className="hint">Click a node to inspect it. Drag to organize.</p>
      </header>

      <div className={`workspace ${selectedNode ? 'workspace--with-details' : ''}`}>
        <section className="graph-panel" aria-label="KnowFlow knowledge graph">
          <ReactFlow
            nodes={visibleNodes}
            edges={initialEdges}
            nodeTypes={nodeTypes}
            onInit={setFlowInstance}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onNodeMouseEnter={(_, node) => {
              if (node.data.parentId && node.data.sourceTerm) {
                setHighlightedSource({
                  parentId: node.data.parentId,
                  term: node.data.sourceTerm,
                })
              }
            }}
            onNodeMouseLeave={() => setHighlightedSource(null)}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.35}
            maxZoom={1.5}
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
          <NodeDetails node={selectedNode} onClose={() => setSelectedNodeId(null)} />
        )}
      </div>
    </main>
  )
}

export default App
