# KnowFlow — Long-Term Product Context

## Product overview

KnowFlow is a browser-based knowledge workspace for AI-assisted learning. It transforms linear AI conversations into an interactive knowledge graph that better reflects non-linear learning and human thinking.

When an AI answer introduces several unfamiliar concepts, a learner should be able to highlight a word, phrase, or sentence and branch it into a separate, focused conversation node. For example:

```text
FreeToken
├── CPU
├── GPU
├── RAM
└── VRAM
```

KnowFlow is not merely a mind-map generator. Its graph is built from real AI-assisted learning conversations and explicit relationships chosen by the user.

## Primary user and initial use case

The initial user is a college student who relies heavily on AI chat tools, especially someone who:

- Thinks non-linearly or divergently.
- Generates multiple follow-up questions from one answer.
- Wants to understand relationships between concepts.
- Prefers knowledge networks to isolated definitions.
- Dislikes searching through long chat histories.
- Wants to revisit a specific concept easily.

The first use cases should focus on technical learning, such as computer science and mathematics.

## Core product model

### Nodes store knowledge

A node can represent a concept, question, conversation branch, explanation, example, confusion, or summary. In the first prototype, most nodes may simply be focused conversations.

A useful node can eventually contain:

- A title.
- Its origin, such as text highlighted in another conversation.
- A focused user/AI conversation.
- Optional user notes.

It should retain enough information for the learner to reopen it and continue from that point.

### Edges store relationships

Edges are first-class knowledge objects, not merely lines between visually adjacent nodes. An edge may contain:

- A relationship type.
- A user-written note.
- Semantic meaning.
- The origin of the relationship.
- Selected context in a future version.

Potential relationship types include `follow-up`, `related to`, `explains`, `example of`, `depends on`, `contradicts`, `compares with`, and `user note`.

Users should eventually be able to select an edge, inspect or edit its relationship, and edit its note. Different relationship types may use simple visual distinctions—for example, solid follow-up edges and dashed manually created semantic edges.

## Critical interaction invariant

Visual position and semantic meaning are independent.

Dragging a node changes only its visual position. It must never automatically change the node's parent, semantic context, edge meaning, inheritance, or knowledge structure. Semantic structure changes only through explicit user actions on nodes and edges.

## Core user flow

1. The user asks a question on an AI chat website.
2. The AI gives a detailed answer.
3. The user highlights something they do not understand.
4. The user chooses an action such as “Ask as new node.”
5. KnowFlow creates a child node connected to the current node.
6. The user asks a focused follow-up question in that node.
7. The conversation is stored inside the new node.
8. The user repeats the process to create branches.
9. The user may explicitly connect existing nodes with additional semantic edges.

Example follow-up relationships:

```text
FreeToken → CPU
FreeToken → GPU
FreeToken → RAM
FreeToken → VRAM
```

Example manually created semantic relationships:

```text
CPU - - - RAM    (related to; “CPU mainly works with system RAM.”)
GPU - - - VRAM   (related to; “GPU mainly works with VRAM.”)
```

## Context semantics

Context logic is an important future design area, but it should not be over-engineered in the first prototype.

A node may eventually use its own conversation, its parent context, explicitly selected related nodes, and selected edge context. By default, a node should mainly know its own content and parent context. Sibling nodes must not automatically share context.

The following questions are deliberately unresolved and must be explored gradually rather than answered through strong implementation assumptions:

- Should edge context influence future AI prompts?
- Should users manually select related context?
- What happens if a node changes parent?
- How should conflicting context be handled?
- How should edge notes influence context?
- Can a node have multiple semantic parents?
- Should users see a context preview before asking AI?

Early versions should not automatically resolve contradictions. Users may explicitly mark relationships such as `contradicts`, `compares with`, or `alternative explanation`. AI-assisted contradiction detection is a possible future feature, not part of the early MVP.

## Product form and sequencing

The long-term product will likely have two parts:

1. A browser extension that captures selected text and the current AI conversation, then sends it to KnowFlow.
2. A larger KnowFlow workspace for viewing, arranging, connecting, editing, and reopening knowledge nodes and conversations.

Start with the workspace. Do not start with the browser extension.

## Initial technical direction

The intended initial stack is:

- React.
- Vite.
- React Flow or an equivalent node-based graph library.
- Local browser storage.

Do not add a backend, authentication, cloud database, AI API, Chrome extension, multi-user collaboration, complex state management, automatic knowledge extraction, or automatic mind-map generation yet.

Keep the architecture flexible enough to explore context logic later, without pre-building speculative systems.

## First prototype

Use this example graph:

- Root: FreeToken.
- Children: CPU, GPU, RAM, and VRAM.
- Follow-up edges: FreeToken to each child.
- Manual semantic edges: CPU to RAM and GPU to VRAM.

The broader first prototype should eventually support displaying and dragging nodes, creating and deleting nodes, connecting nodes, selecting nodes and edges, viewing node details, editing edge relationship types and notes, and simple visual distinctions between relationship types.

However, implementation must proceed in small working increments. The first implementation step is only:

- A locally runnable React + Vite project.
- A simple KnowFlow page.
- A knowledge graph canvas.
- The FreeToken example nodes and their follow-up edges.
- Draggable nodes.

Do not build the entire prototype in one pass.

## Preferred initial layout

Use a minimal three-part workspace when the relevant features are introduced:

- Left: KnowFlow title, basic controls, and Add Node.
- Center: the knowledge graph canvas.
- Right: selected node or edge details.

Avoid complicated navigation, unnecessary animations, menus, dialogs, and decoration.

## Development principles

The user is a computer science student without deep modern frontend experience and expects Codex to handle most implementation details. Codex should act as an engineering partner while leaving product behavior, interaction logic, priorities, and UX decisions under the user's control.

- Keep code simple and readable.
- Prefer straightforward solutions over clever ones.
- Avoid unnecessary frameworks, dependencies, and abstractions.
- Explain major architectural decisions clearly.
- Make small, testable changes.
- Preserve working functionality between iterations.
- Prioritize interaction logic, the node-edge knowledge model, usability, clear behavior, and stability before visual polish.
- Keep the interface lightweight and extremely simple.
- Do not automatically organize or generate a mind map unless explicitly requested later.

After major features or decisions, briefly document what was built, what product question appeared, what decision was made and why, and what should happen next. Build first; record only useful decisions afterward.

## Positioning

KnowFlow is intended to support future internship, research-assistant, and graduate-school applications. It should demonstrate product thinking, human–AI interaction, knowledge representation, learning technology, frontend engineering, interaction design, iterative development, and research curiosity.

A possible long-term research question is: “How can AI systems support non-linear learning and long-term knowledge construction?” Do not force the project into academic research too early; the first priority is a convincing working system.

## Principles that must remain true

1. Nodes store knowledge.
2. Edges store relationships.
3. Edges may contain meaningful context and user notes.
4. Visual location does not define semantic meaning.
5. Dragging nodes does not change context.
6. Semantic changes must be explicit.
7. User control is more important than automatic organization.
8. Do not automatically generate a mind map unless explicitly added later.
9. Do not assume sibling nodes share context.
10. Keep the interface extremely simple.

Treat this document as the long-term product context for the repository. Before making major product decisions, preserve these principles and ask if the behavior is ambiguous.
