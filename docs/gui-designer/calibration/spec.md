# PdxGui layout spec (measured)

Rules for the GUI designer's layout engine. Every rule carries provenance:
"B1" = measured in batch 01, etc. Confidence is pixel-exact unless noted.
Open questions at the bottom. Game version at measurement time: current
live CK3 install, 100% UI scaling, 1:1 pixels.

## Coordinate system and rendering

- Origin top-left, +x right, +y down, UI units == screen pixels at 100%
  UI scaling; rendering is linear in scale. (B1-A)
- Child coordinates are relative to the parent's top-left; nesting
  accumulates offsets linearly with no implicit padding. (B1-H)
- Plain `widget` does NOT clip children; children may render fully outside
  the parent's rect. (B1-D)
- A `widget` with no `size` has a ZERO rect (no background rendered, no
  hugging, no filling); its children still render relative to its origin.
  (B4-T1)
- Percent sizes (`size = { 50% 50% }`) resolve against the parent's rect.
  (B4-T2)
- `scale` on an icon multiplies its rect, anchored at the top-left
  position. (B4-T4)
- Draw order = file order, later on top. (B1-C, occlusion behavior)
- `color = { r g b a }` tints multiplicatively in plain sRGB:
  rendered_channel = round(value * 255 * texture_channel/255). No gamma or
  linear-light conversion. (B1-G/E backgrounds)
- Default `texture` fill for solids: `gfx/interface/colors/white.dds`.

## Anchoring (widget, icon, any positioned child)

- `parentanchor` picks a point on the parent rect (left/hcenter/right x
  top/vcenter/bottom, `center` = both centers). Default: top-left.
- `widgetanchor` picks the point on the child that lands on the parent
  anchor point. **Its implicit default is the value of `parentanchor`**,
  not top-left. So `parentanchor = bottom|right` alone places the child
  flush inside the corner. (B1-B, all 9 anchors exact; B1-C explicit ==
  implicit)
- Centering uses exact halves: x = (parentW - childW)/2 etc. (B1-B)
- `position = { x y }` is added AFTER anchoring, always screen-space
  +right/+down regardless of anchors (vanilla uses negative offsets with
  bottom/right anchors). (B1-D)

## hbox / vbox

Box sizing depends on the parent kind:

- Parent is a plain `widget`: the box **stretches to fill the parent's
  entire rect in both axes**. Explicit `size` on the box is ignored
  entirely, whether smaller or larger than the parent. (B1-E/F, B2-I1,
  B3-P1)
- Parent is another box: the box **hugs its content exactly** (the wiki
  gallery behavior), and is then placed by the parent's normal child
  rules (cross-centered + space-around). Children inside a hugged box
  are packed with no residual gaps. (B2-I2)
- `position` on a box translates its final rect after sizing (a stretched
  box shifts and overflows the parent, unclipped). (B2-I3)
- Cross axis: every child is individually centered:
  offset = (boxCross - childCross)/2. (B1-E/F)
- Main axis with children total C, spacing s, n children, margin m
  (main-axis component), box main size W:
  - `free = W - 2*m - C - s*(n-1)`
  - each child receives an equal side margin `side = free / (2n)` on both
    sides; adjacent side margins stack, so the visual gap between children
    is `s + 2*side` and the leading/trailing inset is `m + side`.
    (CSS equivalent: justify-content: space-around, plus explicit spacing.)
  - positions are computed fractionally and rasterized within +-1px.
    (B1-E1/E2/E3, three independent confirmations; B1-F vertical mirror)
- `spacing = n` adds n between adjacent children (inside the gap). (B1-E2/F2)
- `margin = { a b }`: a = horizontal inset, b = vertical inset. (B1-E3)
- Directional margins (`margin_top` etc.) inset ONE side of the content
  area; the distribution model then runs inside the remaining area
  (margin_top 30 in a 120-tall box put a lone 40-child at
  y = 30 + (90-40)/2 = 55, exact). (B4-T7)
- `expand = {}` is a growing spacer: absorbs all free space, pushing
  later siblings flush to the far edge. (B4-T8, B3-P2)
- Default spacing and margin are 0. (B1-E1)

### Layout policies (main axis, measured numerically)

Unified model: policy-driven resizing happens FIRST, then the space-around
distribution applies to the residual free space (usually 0 when any child
expands, so children end up packed from the box origin).

- `expanding` (k children with it): each gets **floor + free/k** — equal
  SHARE of free space, not equal final size (floors 40/100 in a 300 box
  became 120/180). (B2-J1/J2, B3-P3)
- `growing`: receives NOTHING while an expanding sibling exists; behaves
  like expanding when alone (took all 220 free next to a fixed sibling).
  `expand = {}` relies on this. (B2-J1, B3-P2)
- Deficit (content > box): each shrinkable child (preferred or shrinking
  alike) loses **deficit/k** — equal delta, not proportional, no
  shrinking-first priority (floors 100/60 in a 120 box became 80/40).
  (B2-J3, B3-P4)

## flowcontainer

- Never auto-wraps: children flow in ONE row (or one column with
  `direction = vertical`), overflowing the parent unclipped — even with
  an explicit `size` (which only sets the container's own rect, not a
  wrap width). The wiki's "wrapping flow" does not hold. (B2-K1/K2, B3-Q1)
- Hugs its content (background covers exactly the content extent,
  including showing through `spacing` gaps) and sits at the parent's
  ORIGIN — no centering, unlike boxes. (B2-K1/K3)
- `spacing = n` separates items along the flow axis. (B2-K3)

## container

- Hugs the extent of its absolutely-positioned children exactly; placed at
  the parent's origin; children keep their positions. (B2-I4)

## margin_widget

- `margin = { a b }` offsets the CHILDREN's coordinate origin by (a,b);
  it does NOT shrink the margin_widget's own rect. With
  `size = { 100% 100% }` the rect is the full parent and children start
  at (a,b). Without a size it renders zero/hugged like B3-Q2 showed.
  (B3-Q2, B4-T3)
- OPEN: whether a box child inside it fills parent-minus-margins (the
  vanilla HUD pattern implies yes; unmeasured).

## scrollarea

- CLIPS its content to its rect (the only clipping container measured so
  far). Scroll offset 0 = content origin at viewport origin; content
  beyond the rect is simply not drawn. Bare `scrollwidget` content renders
  without scrollbar chrome. (B3-R1)

## Alpha

- `color` alpha and the `alpha` property multiply into one effective
  opacity; straight alpha blend, rendered = trunc(opacity * src * 255)
  over the destination. 0.5 red over black = (127,0,0). (B2-N)

## Text (`text_single`)

- Default font: `StandardGameFont` = **Gitan-Regular** (fonts/fonts.font),
  `Font_Size_Small` fontsize 15. The webview renderer can load the game's
  TTF directly. (vanilla gui/preload/labels.gui + fonts.gui)
- Line box height 21px at 100% scale (the font template declares
  size = { 0 23 }; measured layout box is 21). (B1-G)
- Layout width = (n-1)*advance + ink_width(last glyph); advance(M)=14,
  ink(M)=13; advance(i)=ink(i)=4; advance(space)=4. `background` covers
  exactly this extent. (B1-G, B2-L, B3-S2)
- All metrics (advance, ink, line box) scale EXACTLY linearly with
  `fontsize` (fontsize 30 = 2x every fontsize-15 number). (B3-S3)
- `max_width` clamps the box to exactly that width with right elision
  (measured oddity: the elided line box was 16 tall instead of 21).
  (B3-S1)
- `multiline = yes` + `max_width` wraps at word boundaries; line advance =
  the single-line box height (21 at fontsize 15); box width = widest
  line. (B3-S2)
- `text_single` is `autoresize = yes`, `elide = right`; beware the vanilla
  `text_multi` TYPE carries a hardcoded `size = { 45 45 }` — override size
  or use textbox+multiline directly. (vanilla labels.gui, B2-L)
- `align` in a fixed-size textbox: horizontal placement is exact with zero
  internal padding (right: x = W - textwidth; center: (W - textwidth)/2
  rounded up). vcenter centers the line box; ink rows measured 18-28 in a
  40-tall box at fontsize 15. (B4-T6)

## Practical notes for the calibration harness itself

- Labels must sit >= 28px above measured rects: antialiased descenders
  merge into same-colored components below. (B1-B analyzer artifact)
- Steam F12 screenshots are JPG; use clipboard snips (the analyzer's
  companion `analyze.ps1` reads a saved PNG; the clipboard can be saved
  via System.Windows.Forms.Clipboard).

## Open questions (queued for batch 05+)

- Box child inside a margin_widget: fills parent-minus-margins? (the HUD
  pattern's actual mechanism)
- Sub-pixel rasterization rule (floor/round/ceil) for fractional box
  offsets — pin down once a case makes it observable at larger scale.
- The 16px-tall elided line box oddity (B3-S1).
- Nine-slice `spriteborder`, sprite frames, `mirror`, fixedgridbox cell
  math, `ignoreinvisible`, overlappingitembox, scrollbar chrome metrics,
  `alwaystransparent`/input behavior (irrelevant to static rendering).
  (nine-slice needs a purpose-built calibration DDS texture, which the
  repo's DDS encoder can generate.)
