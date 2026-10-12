# KnowFlow UI Guidelines

## Product character

KnowFlow should feel quiet, rational, clear, compact, and exploratory. It is a
working environment for thinking, not an AI marketing surface. Knowledge and
relationships should receive more visual attention than interface decoration.

## Principles

1. Content comes before decoration.
2. Use neutral surfaces and one restrained accent color.
3. Prefer borders and spacing to floating cards and shadows.
4. Keep controls compact, but preserve comfortable reading space for messages.
5. Visual position never implies a semantic relationship.
6. Interaction states should be visible without changing layout.
7. Product copy should describe user actions, not implementation details.

## Visual references

- Codex for compact sidebar organization.
- Claude for quiet, content-first presentation.
- Linear for precise spacing and interaction states.
- Figma for canvas and inspector behavior.

Use these as behavioral references, not as templates to copy.

## Color

- App background: `#f7f7f5`
- Sidebar: `#f1f1ef`
- Surface: `#ffffff`
- Hover: `#e8e8e5`
- Selected: `#e3e6ed`
- Primary text: `#242422`
- Secondary text: `#65655f`
- Muted text: `#92928b`
- Border: `#deded9`
- Strong border: `#c9c9c2`
- Accent: `#405fc4`
- Accent surface: `#e8ebf5`

Blue is reserved for selection, connections, focus, and primary actions. Do not
use blue as a general surface color.

## Typography

- Workspace title: 14–15px, semibold.
- Panel title: 14–15px, semibold.
- Body: 13–14px, regular.
- Sidebar items: 12–13px, medium.
- Supporting text: 10–12px, regular.

Avoid oversized headings, very heavy weights, wide letter spacing, and repeated
uppercase labels.

## Shape and elevation

- Small radius: 5px.
- Medium radius: 8px.
- Large radius: 10px, used rarely.
- Default panels have no shadow.
- Nodes may use a minimal one-pixel shadow for separation from the canvas.
- Selected elements use a border or focus ring, never a large glow.

## Layout

- Sidebar: 256px by default, resizable from 200–420px, and collapsible to a
  narrow rail.
- Top toolbar: 56px.
- Details inspector: 340px.
- The canvas fills all remaining space without an enclosing floating card.
- Sidebar, canvas, and inspector are separated with one-pixel borders.

## Sidebar

- A list item represents a graph, not an individual node.
- The visible label is the root conversation summary.
- Use a neutral hover background and a slightly stronger neutral selected state.
- Show status and metadata as plain secondary text, not pills.
- Account status belongs at the bottom.

## Graph canvas

- Keep the dot grid subtle.
- Controls should be small, flat, and visually secondary.
- Edges use neutral gray by default; the accent color indicates selection.
- Empty-state copy should be brief and instructional.

## Nodes

- Nodes are compact conversation containers, not decorative cards.
- Use a thin neutral border and restrained radius.
- User messages align right; AI messages align left.
- Thinking and error states must not cause text or layout to jump.
- Dragging changes visual position only.

## Details inspector

- Use a full-height flat panel separated by a left border.
- Treat it as an inspector, not a modal or floating card.
- Group content with spacing and divider lines.
- Keep user and AI messages visually consistent with node previews.

## Interaction states

Every interactive component should define default, hover, focus, active,
selected, disabled, loading, and error states where applicable. State changes
must not shift surrounding content.

## Content language

- Prefer short action labels such as `New graph`, `Ask a question`, and `Retry`.
- Do not expose roadmap or implementation language in the interface.
- Avoid promotional phrases such as “AI-assisted workspace.”
- Use `Saved on this device` for local persistence.
- Use `Sign in to sync across devices` when authentication is available.

## Patterns to avoid

- Blue-purple gradients.
- Large rounded floating panels.
- Heavy shadows and glow effects.
- Excessive pill badges.
- Decorative uppercase eyebrow text.
- Generic AI sparkles or robot imagery.
- Long instructional sentences permanently occupying the toolbar.
- Adding a new visual treatment when an existing token or component is enough.
