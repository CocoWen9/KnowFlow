# KnowFlow

KnowFlow is a browser-based knowledge workspace for AI-assisted learning.

It helps users turn linear AI conversations into interactive node-edge knowledge structures. Users can create knowledge nodes, connect related concepts, and add notes to both nodes and edges.

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

The first working slice displays the FreeToken example as a draggable knowledge graph:

- FreeToken → CPU
- FreeToken → GPU
- FreeToken → RAM
- FreeToken → VRAM

The graph flows from top to bottom with curved follow-up edges. Each node previews a static user/AI exchange so that nodes read as conversation containers rather than simple labels.

Dragging changes only a node's visual position. It does not change the graph's semantic relationships.

This prototype does not yet connect to an AI model or send live chat messages.

## Run Locally

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```
