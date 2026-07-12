# Changelog

## 0.1.0 (public alpha)

First version to leave the dev machine, published as a Marketplace
**pre-release**. The public series restarts at 0.1.0; the entries below it
are the internal development history under the old 1.x numbering and describe
everything this alpha contains. Extension ID: `JDeffner.ck3-modding-toolkit`.
Licensed GPL-3.0-or-later (was MIT internally): distributed forks must stay
open source.

### Added
- **descriptor.mod language support** (new language `paradox-mod`, applied to
  `descriptor.mod` and `.mod` files): dedicated syntax highlighting, completion
  for every launcher key with an explanation of what the value means and a
  ready-to-fill example (`supported_version` offers the installed game version,
  `picture` lists image files in the mod root), the launcher's 21 category
  tags completed inside `tags={ }`, and hover docs on every key. Key set and
  tag list verified against the launcher docs and 86 real .mod files.
- **Missing-descriptor error**: a folder that contains CK3 content but no
  `descriptor.mod` gets an error (code `descriptor-missing`) plus a one-click
  **CK3: Create descriptor.mod** fix that scaffolds a launcher-correct file.
- **descriptor.mod diagnostics** (source `ck3-descriptor`): missing
  `name`/`version`/`supported_version`, unknown keys, duplicate keys, and
  `path=` accidentally shipped inside descriptor.mod (machine-path leak).
  All 88 real descriptors on the dev machine validate clean.

### Fixed
- **ck3-tiger no longer runs (or complains) in non-CK3 workspaces**: automatic
  runs (on save, on config change) are skipped silently when the mod folder has
  no `descriptor.mod`; only a manual *Run Validation* still explains what is
  missing.

## 1.10.0

### Added (2026-07 scope & variable audit)
- **Scope inference overhaul**, measured against the full AGOT mod (807k
  trigger/effect sites: unknown-scope rate 50.0% → 32.9%) and a private dev
  mod (audit harness: `scripts/audit-scope-inference.ts`):
  - `scope:x.link.link` dot-chains now resolve — the `scope:`/`var:` prefix
    check ran before the dot-split, so any chain starting with a saved scope
    lost the type (~85k sites in AGOT).
  - `random_list` / `random_valid` no longer masquerade as list iterators
    (~45k sites regained their scope).
  - Data links with arguments resolve: `culture:czech`, `title:k_x.holder`,
    `special_guest:officiant` (plus an output patch for `special_guest`,
    whose script_docs entry omits its output scope).
  - `prev` pops the scope stack, so `prev.prev` walks two levels.
  - Script-value math keys (`value`, `add`, `min`…) as block keys are
    scope-transparent instead of resolving as the same-named links.
  - **Scripted-list iterators**: `every_held_county` & co. (generated from
    `common/scripted_lists`, absent from script_docs) resolve their target
    scope through the list's `base`, transitively, and are offered in
    completion for vanilla and mod lists alike.
- **Per-definition root scopes**: events honor `scope = X` (default
  character), customizable localization honors `type = X`, scripted GUIs
  honor `scope = X`, and on_action files get their per-name Expected Scope
  from the user's `on_actions.log` (879 entries on the current patch).
  Scripted effects/triggers/values/modifiers honor a CK3Doc `@scope <type>`
  doc-comment tag as their declared calling scope.
- **Per-block root scopes** harvested from the game's own `_*.info` docs
  (`# root = the activity` → 206 keys across 50 kinds): `is_valid` in an
  activity infers activity scope, building blocks infer province, secret
  `on_expose` infers secret, and so on.
- **Ambient scope coverage** grew from 1 kind (interactions) to 40+:
  activities, schemes (+agents/pulse actions), secrets, casus belli, council
  tasks, situations, story cycles, legends, epidemics, inspirations, court
  positions, great projects, domiciles, tax slots, elections, and more —
  `scope:host`, `scope:scheme`, `scope:attacker` … now complete, hover and
  type correctly. Root scopes were added to ~45 schema kinds alongside.
- **Variable model rebuilt on the actual namespaces**: `var:` /
  `local_var:` / `global_var:` are separate storage classes; variable LISTS
  (`add_to_variable_list` & co.) are indexed at last (387 AGOT list names
  had no completion, now 12 edge cases), dual-indexed so `has_variable` /
  `var:` still see them; `variable = X` inside in-list iterators completes
  and references only list names of the right class; `has_variable = |` and
  the whole read family complete variables; reads (`clamp_variable`,
  `is_target_in_variable_list`…) are references, not phantom definitions.
- **Variable value types**: set-sites store the value expression; literals,
  flags and link chains anchored at `root` or a global link resolve
  statically, so `var:my_title.holder` chains keep scope awareness,
  `every_in_list = { variable = x }` infers the item type where knowable,
  and variable hovers show `→ character` plus namespace-correct set-site
  links.
- `save_scope_value_as` is indexed (completion/hover/references for the
  saved name, typed value/boolean/flag) — previously invisible.
- Saved scopes recorded inside `scope:ambient = { … }` blocks now type
  correctly (the ambient seed reaches the collector), and saves later in a
  file resolve through earlier ones.

### Fixed
- The indexer no longer walks dot-directories (`.git`, `.claude` worktrees):
  stale worktree copies of a mod no longer pollute completion/navigation.

## 1.9.0

### Added
- **Data-function IntelliSense got a ground-truth engine** for `[ ... ]`
  expressions in .gui and localization files. A cached background harvest of
  the user's own vanilla files (all `gui/*.gui` plus `localization/<lang>/`,
  ~200k expressions in under a second, then ~0.1s from cache per session)
  now feeds every feature, so names newer than the bundled wiki tables —
  `HouseAspiration`, `GetHouseAspiration`, window types, everything a future
  patch adds — are covered automatically:
  - Completion knows every chain start and member vanilla uses, ranked by
    real usage frequency, annotated with counts and deduced descriptions.
    Unresolvable chains fall back to the vanilla member pool instead of
    going silent (AD-5).
  - Hover cards show the signature, provenance (DumpDataTypes log / wiki
    tables / deduced from vanilla usage), a description (curated for ~30
    engine utilities, deduced from the name for the rest), observed literal
    arguments, and up to two real vanilla examples that link straight into
    the game files.
  - **Signature help** inside `Func( … )` — argument types from the user's
    DumpDataTypes log when present, else the observed vanilla arity — with
    the active parameter highlighted.
  - **Literal-argument completion**: typing `GetHouseAspiration('` offers
    `'no_aspect'`, `'strength'`, … — the values vanilla actually passes.
  - **Format-suffix completion** after `|`: `|E`, `|U`, `|V`, … with usage
    counts.
- Signature help now also works in .gui and localization files (previously
  script only); `(`, `,`, `'` and `|` trigger the matching features.
- `DumpDataTypes` output is now also read from a `logs/data_types/`
  subfolder, and dump entries carrying description prose show it in hovers.

### Fixed
- **4-part history dates highlight fully**: `7308.1.1.1 = { … }` (date with
  hour component, used in AGOT title history) now colors as one date instead
  of leaving a dangling `.1`. Applied to the script and .info grammars.
  (Found by auditing against PMT's lexer and the AGOT team's ckparser.)

### Added
- **Color-model tags highlight**: `rgb`, `hsv`, `hsv360` before a `{ … }`
  block (`color = hsv360 { 25 90 80 }`) now read as type tags instead of
  plain text.

## 1.8.0

Full syntax-coverage sweep of a real mod ("stop finding gaps one
screenshot at a time"): a new rerunnable audit
(`scripts/audit-mod-coverage.ts`) checks every scalar in a mod against the
grammar, semantic tokens, and hover, and everything it flagged was fixed.
Measured on that mod (18,212 scalars): words rendering with NO
color fell from 82 distinct (script) + 83 (gui) to 5 + 31 — the rest are
genuinely freeform custom names — and hover-less words fell from 178
distinct to 58.

### Added
- **Flags, lists, trait groups and game-concept aliases are indexed**:
  `add_character_flag = X` (any `add_*_flag`, scalar or `{ flag = X }`)
  and `add_to_list = X` declare names; `has_*_flag`, `is_in_list`,
  `list =` etc. reference them — coloring, hover, find-references.
  Trait `group = X` indexes a trait_group (accepted by `has_trait`);
  game-concept `alias = { … }` entries index as concepts.
- **Enum values color and document themselves**: `type = character_event`,
  `category = personal`, `valid_sex = female`, `province_filter = capital`,
  `ai_recipients = courtiers` — driven by structure-spec enums (several
  newly curated from the game's .info docs).
- **Hover fallback cards** for the glue vocabulary nothing documented:
  grammar/math keywords (`limit`, `NOT`, `base`, `add`, `days`… ~40
  curated docs), scope words (`ROOT`, `this`, `prevprev`…), macro
  parameters (`AMOUNT = 3` resolves against the called scripted effect's
  `$AMOUNT$`), engine-effect block arguments (`target_character` inside
  `start_scheme` shows the effect's own doc), generated relation triggers
  (`has_relation_dao_guide` → the scripted relation), event namespaces,
  and enum members. Dot chains (`root.location.county`) now resolve the
  segment under the cursor.
- **Asset values are visible**: unquoted values of icon/texture/animation/
  entity/camera/soundeffect/environment/… keys color as unquoted strings
  (`icon = spirit_root_2.dds`, `animation = happiness`).
- **Dedicated .gui grammar**: template/type/types/block/blockoverride
  keywords, `_show`/`_mouse_enter` state names, and the anchor / layout /
  blend-mode / sprite-type enum vocabulary (case-insensitive), on top of
  the script grammar.
- **New structure docs**: customizable_localization (text → trigger /
  localization_key / setup_scope / fallback), story_cycle (effect_group,
  triggered_effect, icon/background), interaction `ai_targets` block with
  the full ai_recipients list, `ai_frequency` (missing from the harvested
  .info data), modifier_definition_formats (new schema kind).
- `on_action` is a ref field: `trigger_event = { on_action = X }` and
  scheme/travel on_action keys complete, color, and hover as on_actions.
- `namespace = X` values color as events and hover as namespaces.

### Notes
- Known remaining hover gaps (by design of this release): activity-type
  sub-block keys, scripted character template keys, trait inheritance
  keys, story-cycle visualization keys — these need the .info harvester
  to learn sub-blocks, tracked separately along with the harvester bug
  that drops `ai_frequency`-style keys.

## 1.7.4

### Fixed
- **`reference` inside `override_background` had no hover and no
  completion** (user-reported): the event structure schema documented
  `override_background` itself but not its inner keys. All six
  `override_*` blocks from `_events.info` (`override_background`,
  `override_transition`, `override_effect_2d`, `override_icon`,
  `override_header_background`, `override_sound`) now offer and
  document their `trigger`/`reference` keys.
- **`reference = ` now completes real values** where the game expects a
  definition: event backgrounds (`wilderness_mountains`…) inside
  `override_background`, transitions inside `override_transition`, 2d
  effects inside `override_effect_2d`. (The `.info`'s "path to the
  texture" comment is stale — since backgrounds became definitions the
  value is a `common/event_backgrounds` key, which is what vanilla
  passes.) Implemented as a block-scoped ref-field table, generalizing
  the existing `trigger_event = { id = … }` special case; hover on
  unquoted values disambiguates through it too.

## 1.7.3

### Fixed
- **`ROOT` had no syntax highlighting** (user-reported): the grammar's
  scope-navigation rule only matched lowercase `root`/`this`/`prev`/`from`,
  but vanilla writes the uppercase forms all over portrait blocks
  (`character = ROOT` appears 120+ times in vanilla events alone).
  `ROOT`/`THIS`/`PREV`/`FROM` (and `PREVPREV`/`FROMFROM`) now color like
  their lowercase twins.
- **Hover no longer stacks unrelated meanings on ref-field values**
  (user-reported: hovering `faith` in `theme = faith` showed both the
  `faith` event target *and* the `faith` event theme). When the hovered
  word is the value of a schema ref field (`theme = X`, `add_trait = X`,
  `on_actions = { X }`), only definitions of the kind that field
  references are shown; every other position keeps the multi-meaning
  cards, since a name genuinely can be several things at once.
- Semantic highlighting applies the same rule: `faith` in `theme = faith`
  now colors as an event theme (definition), not as the event-target
  scope link.

### Added
- `theme` is a schema ref field (→ `event_theme`): event themes are now
  completed after `theme = `, and theme usages participate in
  find-references and reference counts.

### Fixed
- **Keys Paradox forgot to document are now completable** (user-reported:
  `success_desc` in a scheme type suggested nothing). The game's own
  `.info` docs are incomplete — scheme_types' `desc`/`success_desc` are
  used 654/75 times in vanilla but documented nowhere — so the structure
  harvest now also mines vanilla usage itself: any key used 3+ times as a
  direct child of a folder's definitions becomes a completion item,
  labeled "Used Nx in vanilla <folder> (not in the .info docs)".
- The harvest now counts key usage at **depth 1 only** (direct children
  of definitions, via the real parser) instead of any depth, which both
  fixes the frequencies used for ranking and removes ~300 false
  top-level keys (an event's option-level `name`/`modifier` etc. no
  longer appear as top-level suggestions). Rank-eval: all floors clear;
  "key not offered at all" dropped to 0% for event/decision tops and
  from 20% to 3.8% for interactions.

## 1.7.1

### Fixed
- **Dynamic-description completion**: typing inside a `desc = { … }` /
  `title` / `opening` / option `name` block of an event (or the
  title/desc/selection_tooltip/confirm_text of a decision, or
  interaction desc fields) now suggests the description-node grammar the
  game documents in `_events.info`: `desc`, `triggered_desc`,
  `first_valid`, `random_valid` (with `count`), and `trigger`/`desc`
  inside `triggered_desc` — at any nesting depth, with the game's own
  doc text on hover. Previously these keys were nowhere: the harvester
  stoplisted them as "grammar" but no layer actually served them.

## 1.7.0

Full-coverage audit of the game's schema docs, a completion-ranking
regression fix, and an event-graph interaction round.

### Added
- **Schema coverage for every remaining game folder**: a new audit script
  (scripts/audit-schema-coverage.ts, run it per patch) compared the
  extension's knowledge against all 164 `_*.info` docs and every common/
  folder in the game. 67 new definition kinds are now indexed and
  completable — game concepts, factions, epidemics, inspirations,
  scripted relations, trigger/effect localization, activity intents and
  pulse actions, scheme agent types and countermeasures, struggle and
  situation catalysts, domiciles, task contracts, succession election
  and appointment, bookmarks, achievements, messages, court-scene and
  portrait-modifier gfx surfaces, and more. structures.json grew from
  70 to 129 kinds (1836 documented keys); every remaining exclusion is
  documented with its reason. freqs.json regenerated.
- **Event graph**: an "All nodes" toolbar button shows the whole mod at
  once; the default node cap rose from 150 to 400. Double-click now
  opens the node's source file beside the graph (references from the
  inspector do the same); right-click re-centers the graph on a node.
  Opening the graph from an event file with no id under the cursor now
  seeds it with the file's namespace, and on_action/decision files seed
  from the word under the cursor; event-graph-applicable .txt files get
  an editor-title button.
- Tools view: "Create" group now leads, "Learn" moved next-to-last.

### Fixed
- **Completion mis-ranking in definition bodies** (caught by the
  rank-eval harness during the audit): harvested `.info` frequencies
  count key usage at ANY depth of a folder, so a raw frequency sort let
  option-level keys (name, modifier, character…) bury the real top-level
  event/decision/interaction vocabulary. Curated keys now keep their
  deliberate order ahead of harvested extras, and harvested copies of
  known sub-block keys are dropped from top level. Rank-eval MRR:
  event_top 0.113 -> 0.246, decision_top 0.155 -> 0.278, interaction_top
  0.079 -> 0.173, effect_block 0.104 -> 0.141; all acceptance floors
  clear again.

## 1.6.1

GUI preview interaction round, from first-use feedback.

### Added
- **Undo / Redo buttons** in the preview toolbar for the preview's own
  edits (guarded: if the document changed under them, they refuse instead
  of misapplying).
- **Reset button**: reverts the file to its last saved state (like closing
  without saving), with a confirmation dialog.
- **Middle-mouse drag pans the camera**; the **scroll wheel now zooms at
  the cursor** (no Ctrl needed).
- **Click-through selection**: clicking the same spot repeatedly drills
  down through the stack of overlapping widgets, topmost first, with a
  "layer 2/5" indicator.
- Saving the .gui file (or reverting it on disk) refreshes the preview.

### Fixed
- **Unpredictable drag results**: widgets spliced in from templates/types
  carry their *instance ancestor's* source line, so dragging them edited
  the wrong widget's position. They are now marked read-only in the
  preview (with an explanatory hint) instead of producing surprise edits;
  and when the selected widget is under the cursor, a drag always applies
  to it rather than to whatever is topmost.

## 1.6.0

### Added
- **Edit .gui files from the preview canvas**: clicking a widget in
  "CK3: Preview GUI layout" now selects it and opens a property panel
  (position, size, source line). Drag a selected widget on the canvas to
  move it — the drop writes a precise `position = { x y }` edit back into
  the source text (undo-able, live re-rendered). Widgets whose rects are
  managed by an hbox/vbox/flowcontainer refuse the drag with an
  explanation, since the game ignores manual positions there; the property
  panel edits or inserts the pair with correct indentation either way.
  Double-click jumps to the source line.
- The GUI preview's template/type store now includes parent mods'
  `gui/` trees (vanilla, then parents in load order, then the mod).
- **Multiple mods loaded at once** (submod / compatibility-patch workflow,
  CW Tools style): add parent mods as extra workspace folders (auto-detected),
  via the new `ck3.parentMods` setting, or via the existing
  `.ck3modding/playset.json`. Parent files get syntax highlighting and
  language features; parent definitions are indexed between the mod and
  vanilla so completion, hover, go-to-definition and the overrides view
  resolve across the whole playset; parent files re-index live on change.
- **`.info` files get syntax highlighting** (new `paradox-info` language):
  the game's `_*.info` format docs opened via "CK3: Open format docs" now
  render with the script color scheme — `== Section ==` headings,
  `<placeholder>` tokens, `yes/no`-style value alternatives, and
  `key = value` examples — while the surrounding prose stays plain.

## 1.5.0

GUI designer groundwork: a live, measured-accurate layout preview for .gui
files.

### Added
- **CK3: Preview GUI layout** (editor title button on any `.gui` file): a
  canvas webview that renders the file the way the game lays it out. Real
  DDS textures via the bundled decoder, the game's own Gitan font, template
  and type resolution across the vanilla + mod gui trees, scrollarea
  clipping, zoom/fit, wireframe outlines. Re-renders live while typing;
  hovering shows a widget's key, name and exact rectangle; clicking jumps
  to its source line (the reverse of the in-game `tweak gui.debug`).
- The rectangles come from a new layout engine whose every rule was
  measured in-game with a 4-batch screenshot calibration campaign
  (pixel-exact anchors, box fill/hug behavior, layout policies, text
  metrics; see `docs/gui-designer/calibration/spec.md`). 47 golden
  fixtures pin the engine to the measurements; all 373 vanilla `.gui`
  files lay out cleanly through it.

## 1.4.0

Feedback round: scaffolds that pass tiger, loc that lands in the right file,
GUI files as first-class citizens, a teaching graph view, and a full tutorial.

### Fixed
- **Event scaffold namespace bug**: appending an event into an existing
  events file that did not start with its `namespace = …` line now prepends
  it (this was tiger's "event file should start with namespace" error). All
  scaffolded `.txt` files now carry a UTF-8 BOM like every vanilla script
  file (tiger warned about the omission). Validated against real ck3-tiger.
- **Localization routing**: new keys no longer pile up in
  `localization/replace/` — they are inserted into the mod loc file that
  already holds their siblings (prefix match), falling back to the mod's
  main loc file. `replace/` is used only for what it actually means in the
  game: overriding vanilla keys. Applies to the edit command, the graph
  inspector, option scaffolds, the coverage-view action and the translate
  loop.
- **CK3: Create translation** no longer prefills values with English text:
  values are blanked and the source text stays visible as an inline
  `# english: …` comment; blank values count as untranslated everywhere;
  the translate-next loop shows the source in the prompt instead of
  prefilling it.

### GUI files, for real this time
- `.gui` files now get **completion, hover, go-to-definition, semantic
  highlighting and brace diagnostics** through the language server. The
  vocabulary comes from a build-time harvest of the entire vanilla gui tree
  (556 widget types with per-type property usage counts): property
  suggestions are ranked by how often vanilla actually uses them on the
  enclosing widget type, `using = ` completes your and vanilla's templates
  (mod first), hover shows usage stats and definition links.

### Structure keys everywhere
- The block-schema layer now covers **~70 kinds / ~1300 documented keys**,
  harvested from every `_*.info` schema doc the game ships and validated
  against real vanilla usage. Keys like the trait `shown_in_ruler_designer`
  now hover and complete with the game's own doc prose.

### Graph view v2
- Nodes show the event's **localized title**; edges are **labeled with their
  origin** — the option's text (`option: Take the gold`) or the section
  (immediate, on_actions…). Typing in the search box live-highlights nodes
  by id or title. A `?` overlay explains the whole view for new modders.

### New
- **CK3: Tutorial** — a bundled 10-chapter CK3 modding course (setup →
  first mod → script language → events → decisions/interactions → content →
  GUI → graphics → debugging → performance patterns), every snippet
  verified against the 1.19 game files, woven together with the extension's
  own workflow. Top of the Tools view.
- **Tiger feedback**: a status-bar spinner while ck3-tiger runs, flashing
  the report count when done.
- **Ctrl+Alt+T** edits the localization of the key under the cursor.
- **Tools view** moved to the top of the CK3 container (expanded by
  default); the other views start collapsed.
- First `.dds` open asks whether to keep the extension's preview as the
  default editor.

## 1.3.0

Textures, the event workbench, and a more capable activity bar.

### DDS
- **Click a `.dds` → see it.** A read-only custom editor decodes the texture
  in-place (DXT1/3/5, BC7, uncompressed — the same pure-TS decoder the hovers
  use) with zoom, 1:1/fit, alpha checkerboard and format/size info. No more
  "unsupported text encoding" dead end.
- **CK3: Convert image to DDS** — command palette, Tools view, or right-click
  a PNG/JPEG/WebP in the explorer. Decoding happens in a webview canvas (no
  codec dependencies); encoding is a built-in BC1/BC3 range-fit compressor or
  lossless uncompressed A8R8G8B8, auto-chosen by transparency. Round-trip
  tested against the decoder.
- **CK3: Image guidelines** — a bundled reference of the sizes and formats
  the game actually uses, measured from the vanilla 1.19 gfx tree (event
  scenes 1592×848 DXT1, trait icons 120×120 uncompressed, decision
  illustrations 1100×440 DXT1, emblems 256×256 DXT5, …).

### Event graph → event workbench
- Clicking a node now opens an **inspector pane**: type/theme/hidden badges,
  localized title & description, per-section logic summaries (trigger /
  immediate / after with their keys), options with resolved text, effect
  chips and trigger/ai_chance badges — and a **references panel** listing
  every saved scope, variable, scripted effect/trigger, script value and
  chained event the event touches, each one click from its definition or
  save site.
- **Edit localization inline**: title, description and option text save from
  the inspector through the BOM-correct loc writer; keys that don't exist
  yet are created in `localization/replace/`.
- **+ Add option** scaffolds a new option block (correct placement, loc key
  included).
- Ctrl+click a node to jump straight to source; double-click refocuses.

### Activity bar
- **Tools view**: one-click launchers grouped by workflow — create (new
  content, translations), images (DDS converter, guidelines), inspect
  (event graph, GUI tree, mod report, .info docs), validate (tiger, launch
  debug, error.log watcher, setup).
- **Localization Coverage**: missing keys carry an inline **Add
  localization…** action (writes the entry directly); the view title gains
  **Create translation**.

## 1.2.0

The "scrambled suggestions" release. Diagnosed by porting VS Code's own
suggest-widget scoring (fuzzyScore + completionModel semantics,
`test/vscodeFuzzy.ts`) and replaying it over the real provider output against
vanilla + a live mod (`scripts/fuzzy-diag.ts`).

### Completion v3
- **Key positions offer verbs only.** Script values, event ids, traits,
  on_actions and loc keys no longer pollute key completion (typing `tra` in an
  effect block used to surface ten vanilla script values above `add_trait`);
  they now complete where they are valid — value positions and prefixes.
- **Server-side filtering + cap + `isIncomplete`.** Responses went from
  11k–38k items / 1.9–6 MB JSON per request to ≤1000 items / ≤~240 KB,
  pre-filtered with the exact match predicate VS Code applies anyway. The
  client re-queries per keystroke, so nothing is ever out of reach.
- **Value positions always answer**: ref fields, structure-key enums/bools
  (yes/no), `trigger_event = { id = }`, list-form refs (`on_actions = { }`,
  `events = { }`), and a generic fallback (script values + event targets +
  yes/no) instead of the key soup.
- **Prefix refs**: `culture:`, `faith:`, `religion:`, `title:`, `character:`,
  `dynasty:`, `house:` complete from the index (extensible via the
  `.ck3modding/schema.json` overlay's `prefixRefs`).
- **New `value` block context**: `ai_chance`, `ai_will_do`, `weight` … bodies
  offer script-value math keys (`value`, `add`, `factor`, `modifier` …) and
  iterators instead of inheriting the effect list; script_value definition
  bodies too.
- **Docs resolve lazily** (`completionItem/resolve`), same-name tokens merge,
  and a name shared across kinds (vanilla `brave`: loc key + trait) no longer
  hides the kind you asked for — `has_trait = brav` finds `brave` again.
- **Word-based suggestions are off** for CK3 languages: no more random
  document words mixed in when a list is empty.
- Context detection heuristics from the game's own `.info` docs: `on_X`
  blocks are effect blocks (except `on_actions`), `X_trigger` blocks are
  trigger blocks.
- AGOT-corpus rank eval after all of this: trigger-block top-5 23.5% → 33.8%,
  "not offered at all" 7% → 1.3%; effect-block missing 21% → 16.3%.

### GUI
- **`.gui` files get syntax highlighting** (new `paradox-gui` language reusing
  the script grammar, applied to files under the mod/game paths).
- **GUI Widget Tree** (`CK3: Show GUI widget tree`, tree icon on `.gui`
  editors): collapsible PdxGui hierarchy — type badges, names, `using` refs,
  animation states, template/types declarations — with click-to-jump,
  filtering, and refresh-on-save.

### Highlighting
- New scopes for the biggest unhighlighted constructs: `@name` script
  constants, bare `$PARAM$` macro parameters, and `@[ … ]` inline math.

### Verification
- End-to-end LSP smoke suite forks the packaged `dist/server.js` over node
  IPC (the client's transport) and drives initialize → didOpen → completion →
  resolve → hover → definition → semantic tokens → `ck3/guiTree` against a
  fixture mod.

## 1.1.1

Hotfix for tiger auto-download (found in the first live 1.1.0 pass).

- The Windows/Linux tiger archive ships two binaries — `ck3-tiger` (explicit
  mod path) and `ck3-tiger-auto` (guesses the mod from the launcher). Binary
  selection returned the alphabetically-first match, i.e. `ck3-tiger-auto`,
  which needs the Paradox user directory and fails with "Cannot find the
  Paradox directory" (e.g. when Documents is redirected off `C:`), surfaced as
  a misleading "downloaded tiger does not run". Selection now prefers the plain
  `ck3-tiger` binary, which is also the one the diagnostics runner needs since
  it always passes an explicit mod path.

## 1.1.0

Grounded in a full-mod corpus analysis of the *A Game of Thrones* mod
(`docs/UPDATE_PLAN_v1.1.md` has the evidence and the A0 triage note).

### Structural keys & ambient scopes (P2)
- **Block-schema layer**: `is_shown`, `desc`, `send_option`, `option`-block
  keys and ~40 other structural keys now get completion and hover, with doc
  prose harvested from the game's own `_*.info` files (interactions, decisions,
  events, on_actions). Regenerate with `scripts/build-structure.ts`.
- **Ambient saved scopes**: `scope:actor`, `scope:recipient`,
  `scope:secondary_recipient`, `scope:intermediary` complete, hover and infer
  their type in interaction files even though no `save_scope_as` exists —
  they're engine-provided.
- Hover is now `scope:`/`var:` **prefix-aware**: a saved-scope card shows the
  name, inferred type, save site in the file, and the engine doc when ambient.

### Completion ranking (P1)
- sortText recomposed as **slot tier → frequency bucket → mod-first → label**:
  structural keys of the current block rank first (`name` is literally the
  first suggestion in an `option` block), then scope-valid tokens and
  definitions ordered by real-world frequency (bundled vanilla+corpus tables in
  `shared/data/freqs.json`, regenerable via `scripts/build-freqs.ts`, merged
  with live workspace usage counts — a mod's own idioms float up). Nothing is
  ever hidden (AD-5).
- Offline **ranking eval harness** (`scripts/rank-eval.ts` + corpus-gated
  vitest suite) with recorded baselines: 15–40× MRR lift in effect/trigger
  blocks; the hottest key now leads every measured context.

### Hover redesign (P3)
- Cards with colored kind badges and **scope pills** (theme-safe
  `--vscode-charts-*` variables; degrades to plain markdown in other clients),
  one compact provenance footer (file link, reference count), a single
  scope-context line per hover, 3-card cap.

### CK3Doc comments (P4)
- A contiguous `#` block right above a definition is its documentation:
  plain prose plus optional `@scope`, `@param`, `@saves`, `@returns`,
  `@example`, `@deprecated` tags. Rendered in hover, completion docs, and
  signature help (`@param` aligns with `$PARAM$`). Existing freeform comments
  in real mods render as-is — zero adoption cost.
- `CK3: New content` gains scripted-effect/trigger scaffolds that emit a
  doc-comment stub.

### Settings
- `ck3.diagnostics.ignore` (codes) and `ck3.diagnostics.ignorePatterns`
  (globs) filter both our diagnostics and tiger-forwarded reports.
- Inline suppression: `# ck3m:ignore <code…>` / `# ck3m:ignore-next-line`.
- `ck3.trace.server` for LSP tracing; `ck3.diagnostics.vanilla` makes the
  "never diagnose vanilla" behavior an explicit contract (default off).

### Notes
- Vanilla index cache format bumped to v4 (doc comments in rows); rebuilds
  once automatically.
- New corpus-gated test suites run when `CK3_GAME_PATH` /
  `CK3_MOD_CORPUS` point at a game install / large mod (319 tests total).

## 1.0.0

The rework lands (see `docs/rework-plan.md` for the design). Highlights over 0.3:

### Architecture
- Split into a **language server + thin client** (LSP). The heavy index and
  all analysis moved out of the extension host; indexing shows progress and
  never blocks typing.
- A real, error-tolerant **CST parser** for Paradox script (validated against
  the entire vanilla corpus: 0 exceptions, ~2s) and for the loc-yml dialect.
- **Schema-driven index**: ~90 folder entries (all verified against a live
  install) covering traits, decisions, interactions, cultures, religions,
  doctrines, landed titles, GUI types, history characters and more — plus a
  **references** table, parent-mod (playset) support, and per-workspace schema
  overlays.

### New features
- Structural diagnostics for the silent-failure class (unbalanced braces,
  BOM/encoding, loc header/filename mismatches, folder traps, unknown
  mod-namespace events, missing required loc). Docs per code under
  `docs/diagnostics/`.
- Scope-aware completion (rank, never hide), value-position completion from
  the schema, `scope:` completion, hover scope chains, opt-in scope inlay hints.
- Find-all-references, rename (script + loc), workspace symbols, outline,
  folding, signature help for `$PARAM$`, conservative formatter.
- **Texture previews on hover** (pure-TS DDS decoder incl. BC7).
- CK3 activity-bar suite: Mod Overview, Problems Summary, Localization
  Coverage, Overrides & Conflicts, interactive **Event Graph**, `CK3: Mod report`.
- Deep tiger integration: confidence, related locations, **baseline** workflow
  for adopting tiger on legacy mods, `--unused`, conf generation.
- Workflow: `CK3: New content` scaffolds, `CK3: Launch CK3 (debug mode)`,
  `CK3: Watch error.log` (live game errors as squiggles), translation loop,
  snippets, `.info` format-docs command.

### Notes
- The vanilla index cache format changed (v3); it rebuilds once automatically.
- v0.3's in-process providers are gone; features are identical or better.

## 0.3.0
- Tiger auto-download, setup command, walkthrough, status bar, translation
  scaffolding, semantic tokens, loc inlay hints and editing.

## 0.2.0
- Definition index (vanilla + mod), completion/hover/definition, tiger runner.

## 0.1.0
- Initial release: language modes, grammars, script_docs parsing.
