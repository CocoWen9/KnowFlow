# KnowFlow

KnowFlow is a browser-based knowledge workspace for AI-assisted learning.

It helps users turn linear AI conversations into interactive node-edge knowledge structures. Users can create knowledge nodes, connect related concepts, and add notes to both nodes and edges.

## Version 1.0 — Cloudflare Edition

This repository snapshot is **KnowFlow 1.0**, the first end-to-end AI-enabled
prototype. The React application is hosted on GitHub Pages, while AI requests
are handled by a Cloudflare Worker using Cloudflare Workers AI and the
`@cf/google/gemma-4-26b-a4b-it` model.

Version 1.0 stores graph data in the browser and does not yet include user
accounts or cloud synchronization. The next backend phase will introduce
authentication and persistent per-user graph storage; this tag preserves the
working Cloudflare-based architecture before that transition.

## Core Idea

AI chat tools are powerful, but their conversations are linear. When users learn complex topics, one AI answer often creates multiple follow-up questions. KnowFlow helps users branch these questions into connected nodes instead of losing them in a long chat history.

## MVP

The first version focuses on a simple web workspace:

- Create, edit, and delete nodes
- Drag nodes on a canvas
- Connect nodes with edges
- Add notes to edges
- Click nodes to view details
- Save the graph locally in the browser

## Example Use Case

A user asks AI about FreeToken. The AI answer mentions CPU, GPU, RAM, and VRAM. The user can turn each confusing concept into a separate node, then manually connect CPU to RAM and GPU to VRAM with note-taking edges.

## Tech Stack

- React 18
- Vite 5
- React Flow (`@xyflow/react`)

## Current Prototype

The first working slice displays the FreeToken example as a draggable knowledge graph. A node can be moved by dragging anywhere on its card:

- FreeToken → CPU
- FreeToken → GPU
- FreeToken → RAM
- FreeToken → VRAM

The graph flows from top to bottom with curved follow-up edges. Each node previews a static user/AI exchange so that nodes read as conversation containers rather than simple labels.

Dragging changes only a node's visual position. It does not change the graph's semantic relationships.

Clicking a node opens a read-only details panel with its origin and full conversation. Clicking the canvas or the close button dismisses the panel.

From the details panel, clicking **Add child node** immediately places a temporary blank child and follow-up edge on the canvas while the parent form stays open. Saving the title and question updates that same canvas node in place, makes it permanent, and starts its AI answer; canceling removes the temporary node and edge.

Users can also select text in either the User or AI message and choose **Add child node**. The selected text becomes the suggested child title, and the new child retains its exact source so hovering it highlights the original phrase in the parent conversation.

Right-clicking empty canvas space reveals a **+** action; clicking it creates a new independent question node. Hovering a node reveals its bottom **+** connection handle. Clicking that handle starts a live curved edge whose free endpoint follows the pointer. The edge can connect to the bottom **+** of an existing node, or finish on empty space to create a temporary question node and edge. Temporary nodes are kept only after their title and question are submitted; leaving them unfinished removes them from the working graph.

Right-clicking a node or edge opens its delete action. Deleting a node removes its full child branch and every edge touching that branch. Deleting a parent–child edge removes its child branch, while deleting a manually added parallel connection removes only that edge.

Clicking a permanent edge opens **Edge details** in the right panel. Users can choose a semantic relationship—such as Follow-up, Related to, Explains, Depends on, Contradicts, or Compares with—and save a note about why the nodes are connected. Follow-up edges remain solid and directed; other semantic relationships are dashed. Newly drawn connections between existing nodes default to Related to.

Each permanent edge can be dragged from anywhere along its curve to reshape it; the small control point shows the curve's bend position. The custom curve is saved with the graph. Temporary draft edges keep their automatic shape until the node is saved.

Graph changes can be undone with **Ctrl+Z** on Windows/Linux or **⌘Z** on macOS. Undo covers node creation and deletion, edge creation and deletion, relationship edits, and node movement. Using the shortcut while editing a text field does not alter the graph history.

The workspace now includes a collapsible left sidebar for multiple local knowledge
graphs. Each list item uses the root conversation's AI summary, and users can
create, search, and switch between graphs. The account entry clearly identifies
the current session as a local-only guest until Supabase authentication is added.

Graphs are saved automatically in browser storage, including added nodes, edges,
and dragged positions. Existing single-graph browser data is migrated into the
local graph library, and reloading restores the active graph.

Newly saved question nodes now request a live answer from Cloudflare Workers AI.
While the request is running, the same node displays **Thinking…**; successful
responses update that node in place, while failed requests keep the node and
offer **Retry** in Node Details. The request includes only the new question, its
parent conversation, and any explicitly selected source text—sibling nodes are
not added as context.

The public React app remains on GitHub Pages. Its AI endpoint is a separate
Cloudflare Worker using a Workers AI binding, so no model credential is stored
in the browser or repository.

## Run Locally

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## AI Worker

The Worker configuration lives in `worker/` and uses the free Workers AI
allocation. Authenticate and deploy it with:

```bash
npx wrangler login
npm run worker:deploy
```

Run the Worker locally with:

```bash
npm run worker:dev
```

The frontend reads the public Worker URL from `VITE_AI_API_URL`. This URL is an
API endpoint, not a secret; model access happens through the Worker binding.
