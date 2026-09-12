@AGENTS.md

# Tingraph

A diagram editor. The reader writes a small DSL, Tingraph parses it, lays it
out, and draws it onto an Excalidraw canvas; from that moment the sheet is
theirs to edit by hand. Eleven notations ship today, in two families:

- **graphs** — `flow` (flowchart), `bpmn` (BPMN 2.0 with pools and lanes) and
  `org` (org chart): elements joined by connectors, edited one at a time.
- **figures** — `bar`, `line`, `pie`, `scatter`, `mind` (mind map), `matrix`
  (2×2), `venn` and `fishbone`: one object, drawn.

`isGraph()`, `isFigure()` and `isChart()` in `lib/types.ts` are what tell them
apart, and almost everything in the editor asks one of them. The architecture
is built so the next notation is a folder and a row, not a new subsystem.

**Keep this file current.** Anything that changes the rules below — a new
notation, a new setting, a change to how connectors are routed or held,
another Excalidraw feature taken over or switched off, a new concept a reader
would not guess from the code — belongs here in the same commit. This file is
the only place that explains *why*; the code explains *how*.

**A new notation is not finished until it is listed.** Three places outside the
editor have to learn about it in the same commit, or a notation ships that
nobody can find:

1. `lib/diagrams.ts` — a `READY_DIAGRAMS` entry with a sample that really
   parses (`npm run self-check` proves it), plus art in
   `components/site/diagram-art.tsx`. This is what fills the catalogue at
   `/build`, which is the page the landing page sends readers to.
2. `app/editor/page.tsx` — the keyword in `CATEGORIES`, or `/editor?type=…`
   will not open it.
3. The landing page needs nothing: it shows the first `FEATURED_COUNT` of
   `READY_DIAGRAMS` on cards and links to `/build` for the rest, and the hero
   types out `HERO_DIAGRAMS` — three, deliberately. Curate by reordering
   `READY_DIAGRAMS`, never by adding another card row.

## The pipeline

```
DSL text → parseDSL → AST → computeLayout → PositionedAST
        → buildSkeletons → convertToExcalidrawElements → the sheet
```

`lib/parser/parse-dsl.ts` → `lib/layout/compute-layout.ts` →
`lib/excalidraw-mapper/build-skeletons.ts` → `lib/excalidraw-mapper/map-to-elements.ts`.

The pipeline runs once, when the reader presses Generate in the source drawer
(`generate()` in `components/editor/editor-root.tsx`). It is the only moment
the code writes over the sheet. Everything after it is the reader's, which is
why nothing else may re-derive the drawing from the source.

## The canvas is a renderer, not an interface

Excalidraw draws and stores; it does not present. All of its own chrome is
hidden in `app/globals.css` — `.layer-ui__wrapper` on a normal sheet, plus
`.App-top-bar` and `.App-bottom-bar`, which is the layout it falls back to in
a short or narrow window. The rail, the drawers, the properties panel and the
zoom cluster are Tingraph's own. What is deliberately left alive outside the
wrapper: the caption editor, the context menu and the colour picker.

Consequences worth knowing before touching the canvas:

- The rail is the only place a tool is chosen. `RAIL_TOOLS` in
  `components/editor/canvas.tsx` lists the Excalidraw tools it drives;
  anything else the canvas reports back is put straight to `selection`.
- `components/editor/rail.tsx` owns the keyboard, and owns it narrowly. **Only
  the two instruments that say what the pointer is answer to a key** — `1`/`v`
  for the pointer, `0`/`h` for the hand. Every other key Excalidraw would take
  a tool from (`STOLEN_KEYS`: the tool letters and the digits `2`–`9`) is
  stopped in the capture phase and answered by nothing. A letter belongs to
  what the reader is writing far more often than to a tool, and a panel that
  needs one can be pressed.
- **Nothing is swallowed while the reader is writing.** `typing()` covers
  inputs, textareas and contenteditable — and anything inside `.monaco-editor`,
  because Monaco writes through an `EditContext` on a plain `div` that none of
  those tests catch. Miss that and every `f` typed into the source reaches for
  Excalidraw's frame tool instead of landing in the code. Excalidraw's own
  guard has the same blind spot, which is why `useCodeKeys` in the source
  drawer stops keydowns at the panel before they reach the document.
- The **Generate panel takes the keyboard entirely** while it is out: it is
  open in order to be typed into, so not even the pointer keys are answered.
- Holding space still pans, because Excalidraw does that itself. The rail only
  records it (`panning` in `lib/store.ts`) so the Hand button can light up and
  the connector layer can step out of the way.
- `window.__tingraphStore` and `window.__excalidrawAPI` are exposed on purpose,
  for driving the editor from a console or a browser agent.

## An element is a unit, not a shape

A task with its marker, a pool with its header band, an org box with its
sub-role pills: each is several Excalidraw elements that must read and behave
as one. `lib/canvas/units.ts` stamps every piece with a `UnitMark` in
`customData.tingraph` — `unit` (the shared name), `kind`, and flags like
`core` (a piece the reader may reach on its own, normally the caption carrier)
and `wash` (a piece filled with the ink's tint, so re-inking can find it).

`normalizeUnits` in `lib/canvas/scene.ts` enforces it every frame: a group
taken apart is re-formed, a half-covered element is selected whole, and
stepping inside one lands on a caption rather than on a marker stroke.

**A figure has no inside at all.** Double-clicking one would otherwise land on
its invisible frame — the piece carrying the spec — and let the reader drag it
out of its own drawing. So a unit marked `figure` cannot be stepped into: the
whole figure is picked instead. For the same reason the canvas closes
Excalidraw's caption editor on a figure's text (`editingTextElement` in
`handleChange`): those captions are cut from the spec, so an edit there would
be thrown away by the next redraw. Renaming happens through the figure's own
handles, which write the spec.

Two rules follow from this and are easy to break by accident:

- `unit` is an identity, not a label. Two elements with the same `unit` *are*
  the same element. Never copy a mark onto something new without renaming it.
- The unit name each notation stamps a node with comes from `nodeUnit` in
  `build-skeletons.ts`: `bpmn-<id>`, `org-<id>`, `flow-node-<id>`. Connectors
  from the source use `flow-<index>`; ones drawn by hand use `line-<random>`.

### Copies

Excalidraw copies an element whole, mark included, so a pasted box used to
answer to the same name as the box it came from and get gathered into its
group. `lib/canvas/copies.ts` renames every copy at the moment it is made, and
`reunit` in `scene.ts` writes that back through Excalidraw's `onDuplicate`
prop, which covers paste, `Ctrl+D`, alt-drag and library insert alike. A
copied connector is re-tied to the copies of both elements it joined; one
copied without them comes away loose and stays where it is put.

## Connectors are Tingraph's, not Excalidraw's

This is the part that differs most from stock Excalidraw, and the part most
likely to be undone by accident.

**Excalidraw's arrow is not used at all.** Its arrow tool is gone from the rail
and from the keyboard. Its endpoint *binding* is never set — not on generated
edges, not on hand-drawn ones — because binding slides an endpoint around a
shape's outline, which is what sends a reporting line out of the side of a box
instead of its bottom. Its linear-element editor (the row of handles down the
middle of a selected line) is closed the moment it opens, in `handleChange`,
because its handles fight a route that is derived rather than drawn.

What is kept is the arrow *element*: a polyline with a stroke style and two
arrowheads. That keeps export, undo, selection, styling and the properties
panel working for free. Everything else is ours.

### The model

A connector carries a `LinkMark` at `customData.tingraph.link`
(`lib/canvas/units.ts`):

| field | meaning |
|---|---|
| `line` | which of the notation's lines this is, from `lib/connectors.ts` |
| `from`, `to` | the unit each end is tied to, and a `side` only when the reader pinned one |
| `bend` | where the reader dragged the middle leg, on that leg's own axis |
| `at` | the signature of the two boxes the route on the sheet was last cut against |

A connector therefore *names* what it joins. It never points at an element id
unless that element has no unit of its own.

### The router

`lib/canvas/connect.ts` is pure geometry — no Excalidraw, no React, so it runs
under `tsx` and is covered by `scripts/self-check.ts`. `routeBetween` returns
the corners; `asElement` turns them into the origin-plus-points shape
Excalidraw stores. Constants that set the feel: `STUB` 16 (how far a line runs
straight out of a box before it may turn), `SNAP` 6 (anchors this close read
as lined up), `CLEAR` 18, `MIN_GAP` 10, `ORG_RAIL` 32.

Anchors, from `sideAnchor`:

- A line running **down** the page leaves from the **middle of the side**. That
  is what lets every child of one box hang off one rail.
- A line running **across** the page meets the middle of the height the two
  boxes **have in common**, so two boxes side by side are joined by one
  straight rule even when one is taller.

Route shapes, chosen by which sides the two ends use:

- ends facing each other, anchors lined up → one straight leg
- ends facing each other, offset → three legs over a channel (`bend` moves it)
- ends facing each other with no room between → five legs round the outside
- ends on different axes → one turn, or four legs when a single turn would
  have to run backwards
- ends leaving the same way → three legs past the further of them

### Pools carry their own controls

A BPMN pool has a small rail beside it on the sheet: add a lane, take the
bottom lane off, add a pool below, delete the pool. A pool never loses its last
lane — that lane *is* the pool's body. Removing a lane or a pool takes what was
drawn inside it, and with it every connector that joined something in there
(`withDanglingLinks` in `scene.ts`), because a line whose end is gone has
nothing left to be cut against.

### Per-notation rules

`sidesFor` picks the two sides. The notation's own reading axis wins when the
boxes are clear of each other both ways; when they are stacked, or standing
side by side, the axis that separates them wins instead.

- **org** reads down the page, so a line leaves the **bottom** of a box and
  meets the **top** of the one below. `railBetween` then puts the middle leg a
  fixed `ORG_RAIL` under the box it leaves, rather than half way. That is the
  whole trick behind the bracket: every child of one box turns on the same
  rail, so a line drawn by hand merges into the rail the source laid out. Two
  boxes on one level are joined by a straight rule across.
- **bpmn** reads left to right along its lanes, so a sequence flow leaves the
  right and meets the left.
- **flow** reads down the page, like org, but splits the channel at the
  midpoint instead of hanging it off a rail.
- An org chart turned sideways (`direction: "right"`) reads across; that is why
  `Rules` carries the direction as well as the category.

Adding a notation means adding a branch to `readsUpright`/`railBetween` here,
and a row to `lib/connectors.ts`. Nothing else needs to know.

### When a route is cut again

`syncConnectors` in `lib/canvas/scene.ts` runs on every scene change:

1. `linkTargets` builds the map of unit name → outline the connectors point
   at. A unit's box is the outline around its shape pieces; anything drawn as
   bare strokes (a BPMN data object) falls back to the outline around all of
   them. Loose captions and the arrows themselves are not targets. The map
   keeps the order the sheet stacks in, so the shape on top wins a hit.
2. For each linked arrow it builds `linkSignature(from, to, link, element)` —
   the two boxes, the pinned sides, the bend, and where the connector sits.
3. Signature unchanged → left alone. No `at` yet → the route is **adopted as
   it is**, which is what keeps the routing the source laid out, legs that step
   around whatever stood in the way and all. Otherwise → cut again.

So a connector re-routes when a box it joins moves, when the reader moves its
leg or re-ties an end, or when the connector itself is dragged out of place —
and in no other case. Writing `RECUT` into `at` is how the gesture layer asks
for a cut without a box having moved.

**Known limit:** a route is cut from the two boxes it joins, so it cannot see
a third. A straight line between two boxes on one level can run through a box
standing between them. Avoiding that would mean routing against the whole
sheet, which would throw away the generated routing every time anything moved.

### The gestures

`components/editor/connect-layer.tsx` is an SVG over the sheet. It takes the
pointer only while the rail holds a connector, so Excalidraw never sees the
gesture at all. A wheel over it is handed down to the canvas — to the canvas
*element*, because Excalidraw's wheel handler ignores anything else — along
with a pointer move, since that is the point the canvas zooms about.

- **Drawing.** Drag from one element to another. The line that follows the hand
  is cut by the same `routeBetween` the finished connector gets, so what is
  drawn is what lands. Hovering shows the outline and four side dots;
  `gripSide` decides whether the press was on a dot, and a dot is grabbed from
  the outline, so a press in the middle of a short box never reads as a press
  on its top edge.
- **The middle leg.** `movableLeg` offers a handle only on a route that turns
  twice, where the middle leg is unambiguously the rail. Drag to move it,
  double-click to give it back to the notation. This is deliberate: one number,
  one meaning, no scattered points.
- **The ends.** Drag an endpoint onto another element to re-tie it; the bend is
  dropped, because it belonged to the old route.

### The rail's connector list

`lib/connectors.ts` holds what each notation draws with — BPMN's sequence flow,
message flow and association; the org chart's reporting line and advisory tie;
the flowchart's flow line and annotation. The rail's arrow button opens the
list; pressing it again with the list open puts the connector back.

**To add ERD:** add its rows to `CONNECTORS` (Excalidraw already carries
`crowfoot_one`, `crowfoot_many` and `crowfoot_one_or_many` arrowheads), and
give `connect.ts` the rule for where a relation meets a table. The rest — the
rail, the gestures, the re-cutting, copies, export — needs no change.

## Figures: one object, drawn

A figure has no nodes, no edges and nothing to route, so it does not travel
through the shared layout at all. `lib/types.ts` gives the AST an optional
`figure: FigureSpec`; when it is there, `computeLayout` passes it straight
through and `buildSkeletons` hands the whole job to that notation's own folder
through `lib/figures/registry.ts`.

```
DSL text → parse<Kind> → <Kind>Spec → layout → build<Kind>Skeletons → the sheet
```

One folder per notation, and they share nothing but the mechanism:

| Folder | Notation |
|---|---|
| `lib/chart/` | `bar`, `line`, `pie`, `scatter` |
| `lib/mind/` | `mind` |
| `lib/matrix/` | `matrix` |
| `lib/venn/` | `venn` |
| `lib/fishbone/` | `fishbone` |

Inside each, the split is the same and is worth keeping: `spec.ts` is what the
thing *is* (no geometry), a layout step is where every mark goes in sheet units
(no Excalidraw), and a build step is the only file that turns that into shapes.
A small figure keeps the last two in one file; a chart and a mind map do not,
because their geometry is long enough to be worth reading on its own.

### The one rule that holds it together

**The panel, the handles on the sheet and the source are three hands on one
`FigureSpec`.** A figure on the sheet is a group of ordinary shapes plus one
invisible rectangle — the frame — whose mark carries the whole spec. Nothing
edits a mark: every edit rewrites the spec and the figure is drawn again from
it (`redrawFigure` in `lib/canvas/scene.ts`). That is why the settings panel
and a dragged bar are the same code path, and why every setting in the panel
has a word in the language and the other way round. Breaking that symmetry —
a control with no keyword, a keyword with no control — is the thing to avoid.

Consequences to keep in mind:

- Redrawing replaces every element of the figure, so the selection is restored
  by unit name afterwards (`changeFigure` in `editor-root.tsx`). Forget that and
  the handles vanish mid-drag.
- A live drag writes with `CaptureUpdateAction.EVENTUALLY`, never `NEVER`:
  `NEVER` makes the dragged state the history baseline and the whole gesture
  becomes unundoable. The settled write is `IMMEDIATELY`, so one drag is one
  step back.
- The axis is read from the drawing as it stood when the grip was taken hold
  of. Reading it live would make the value chase the pointer as the scale
  grew under it.
- Excalidraw fills a `line` whose first and last points meet, which is how a
  pie slice is drawn. Keep slices closed.
- Resizing a figure on the sheet stretches its shapes like any group;
  `syncFigures` notices the frame is no longer the size the spec claims and
  draws it again properly once the pointer is up.

### Colour

The categorical order in `spec.ts` is fixed and validated as a set — worst
adjacent pair ΔE 9.1 under protanopia, 19.6 in normal vision, against white
paper. Do not reorder it, do not add a ninth hue: a ninth series comes round
to the first, and the reader can pin a colour on any series. `auto` is the
default and means "one colour when one thing is being measured, the
categorical order when several are", which is what makes a single-series bar
chart one colour and a pie six.

### What each figure does on the sheet

The canvas follows the notation. These are not variations on one interaction
model; each is the gesture that notation actually wants, and they are meant to
stay different:

| Notation | What the sheet is for |
|---|---|
| charts | drag a bar's end, a line's dot, a scatter point, a pie's boundary |
| `mind` | **this is where a mind map is built** — press a branch for its four actions, drag to pin it (its whole subtree follows), press the outward ring to grow a new one, double-click to rename, and swap the shape for a picture |
| `matrix` | drag an item about the field; where it lands is what it means |
| `venn` | drag a ring to set the overlap |
| `fishbone` | press a bone to put a cause on it, a cause to put what is behind it |

Three things every figure has on the sheet, built from
`components/editor/figure-handles.tsx` so they behave alike:

- **A pair, `+` and `−`, where the next one would go.** Readings past the last
  bar, bones on the spine, items under the field, the third Venn ring. Anything
  that can be added can be taken away from the same place.
- **Parts that can be pointed at.** A `HitBox` sits over each caption the spec
  owns, at exactly the box the renderer drew it in — which is why the plans
  (`planFishbone`, `planVenn`, `matrixTitle`) hand out those boxes rather than
  letting the handles guess. Pressing one picks it and raises a small bar of
  what that part can do; double-clicking goes straight to renaming.
- **Renaming in place.** `Rename` writes the spec and the figure is drawn
  again, so the sheet and the panel never disagree.

Two rules worth keeping when adding more:

- **Formal is the default, everywhere.** Black outlines on white, colour
  carried by the lines rather than by fills. The washed fills a mind map is
  usually drawn with, the solid quadrants a matrix is usually drawn with, the
  tinted rings a Venn is usually drawn with: all of those are styles the reader
  picks, never what they get. This is a tool for papers first.
- **A pin never moves anything else.** A mind map works out its frame from the
  arrangement *before* any pin is applied, so dragging one branch does not
  shift the map under the reader's hand. Any figure that gains dragging needs
  the same property.

### Starting again

Every figure panel ends with a reset that puts the figure back to
`figureDef(kind).blank()`, and the Generate panel has the same for a graph:
it rewrites the source with the notation's template and draws it. Both ask
twice — one press arms, the second does it — because both throw work away.

### Adding a notation

1. A folder under `lib/` with its own `spec.ts`, layout and build. Nothing in
   it should import another notation's layout — the palettes and the colour
   helpers in `lib/chart/spec.ts` are shared on purpose; geometry is not.
2. Its parser in `lib/parser/`, over the shared tokeniser in `tokens.ts`.
3. A row in `lib/figures/registry.ts`, and the kind in `FIGURE_KINDS`
   (`lib/types.ts`) so `isFigure()` knows it.
4. Its own panel, `components/editor/<kind>-drawer.tsx`, picked up by
   `figure-drawer.tsx`, and its handles picked up by `figure-controls.tsx`.
   Those two files switch on `spec.kind` and hold nothing else: a fishbone's
   panel is a list of causes and a Venn's is a list of regions, so there is
   nothing to share between them beyond the fields in `figure-fields.tsx`.
5. Its guide section in `lib/guide.ts`, a template in `lib/templates.ts`, and
   the three listings named at the top of this file.

Everything else — the rail, the inspector, redrawing, copies, resizing,
export — already asks `isFigure()` and needs no change. If you find yourself
editing the rail or the canvas to add a notation, the abstraction has slipped
and that is the thing to fix.

## Checks

`npm run self-check` runs three assert-based scripts under `tsx`:
`scripts/self-check.ts` (parser, layout, connector geometry, copies, and every
figure's own geometry — a Venn region really falls inside the right rings, a
fishbone's causes really meet their bone),
`scripts/mapper-check.ts` (skeletons) and `scripts/editor-check.ts` (styles,
inspector, export). No test framework. Anything that can be answered without a
browser should be asserted there rather than clicked through.

`npm run typecheck` and `npm run lint` both have to stay clean; the lint config
is strict about React hooks, including reading a ref during render.

The canvas itself can only be judged by driving it. Clicks and screenshots
through a browser agent work; plain key presses and drags often do not arrive,
so dispatch synthetic `PointerEvent` and `KeyboardEvent` instead, and send
every event of one drag to the element hit at the start.
