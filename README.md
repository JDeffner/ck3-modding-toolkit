# CK3 Modding Toolkit for VS Code

Crusader Kings III mod development, end to end: a language server with a real
Paradox-script parser, completion that knows what scope you're in, instant
diagnostics for the silent-failure class of bugs, deep
[ck3-tiger](https://github.com/amtep/tiger) integration, a live mod overview
(inventory, localization coverage, overrides, event graph), and a localization
workflow no other tool has.

**Positioning in one line:** CWTools' editor intelligence without its rule rot,
wrapped around ck3-tiger instead of competing with it, plus overview and
workflow features nobody else has. All language knowledge is *derived from the
game itself* — your `script_docs` logs, the vanilla files, a small schema table
— so it stays current across patches.

## Feature tour

### At the cursor
- **Completion** — grammar-aware: key positions offer *verbs* (engine
  triggers/effects/scope targets and your scripted effects/triggers, filtered
  by trigger vs effect vs script-value-math block), value positions offer
  *nouns* (`has_trait = ` lists traits, `trigger_event = ` and `{ id = }`
  list events, `on_actions = { }` lists on_actions, loc-valued keys list your
  mod's loc keys, unknown keys fall back to script values + event targets +
  yes/no), and `scope:`, `var:`, `culture:`, `faith:`, `title:` … complete
  their referents. Items valid in the current *scope* (character vs title vs
  province, inferred from the block chain) rank first by real-corpus
  frequency; other-scope items are annotated, never hidden. Lists are
  server-filtered with VS Code's own matching rules and capped, so the suggest
  widget stays fast and relevant even against the full vanilla index.
- **Hover** — docs merged from `script_docs` (authoritative, your exact patch)
  and the bundled wiki lists (work out of the box); supported scopes; the
  current scope chain at the cursor; resolved localization text; and **texture
  previews** — hover any `.dds` path to see the image (pure-TS DDS decoder,
  DXT1/3/5/BC7, mod-first resolution).
- **Navigation** — go-to-definition, find-all-references, fuzzy workspace
  symbols (Ctrl+T) across mod, parent mods and vanilla; safe rename across
  script + localization (mod-defined names only); outline/breadcrumbs; folding.
- **Signature help** for `$PARAM$` parameters of scripted effects/triggers —
  and completing a scripted effect/trigger inserts its parameter block ready
  to fill (paramless ones offer a `yes|no` choice).
- **descriptor.mod support** — syntax highlighting, hover docs and completion
  for every launcher key (with what the value means and a ready-to-fill
  example: `supported_version` offers your installed game version, `tags={ }`
  offers the launcher's category list). A mod folder without a descriptor.mod
  gets an error with a one-click **CK3: Create descriptor.mod** fix.
- **Inline localization** — loc text as inlay hints next to keys; quick-fix
  editing that writes BOM-correct yml (vanilla keys routed to
  `localization/replace/`); loc↔script navigation both ways; a reference-language
  overlay when editing translations.

### Diagnostics (source `ck3-script`)
Instant, structural, certain — the class of bugs the game swallows silently:
unbalanced braces (*rest of file ignored*), missing UTF-8 BOM, `l_english:`
header vs `_l_english.yml` filename mismatch, tabs in loc files,
`common/on_actions` (plural) and `localisation/` folder traps, references to
mod-namespace events that don't exist, schema-required loc keys that are
missing. `.mod` descriptors get their own checks (source `ck3-descriptor`):
missing descriptor.mod, missing `name`/`version`/`supported_version`, unknown
or duplicate keys, `path=` shipped inside descriptor.mod. Everything deeper is
ck3-tiger's job — by design.

### ck3-tiger integration
Auto-download, run on save (debounced) or manually, JSON reports as native
Problems with severity *and confidence*, all report locations mapped. Adopting
tiger on a legacy mod: **CK3 Tiger: Create Baseline** suppresses today's
reports and shows only new ones (toggle anytime). `--unused` one-shot run,
`ck3-tiger.conf` generation from settings.

### The CK3 activity-bar view
- **Mod Overview** — content inventory by kind, click-to-open.
- **Problems by Type** — diagnostics sliced severity → source·code → file.
- **Localization Coverage** — per language: missing / orphaned / untranslated.
- **Overrides & Conflicts** — what shadows vanilla, with the LIOS/FIOS winner
  (including the GUI first-in-only trap).
- **Event Graph** — events ↔ `trigger_event` ↔ on_actions as an interactive
  graph. Click a node for the **inspector**: localized title/desc/options
  (editable inline, BOM-correct writes), section summaries, and every
  referenced scope/variable/scripted effect with jump-to-definition;
  "+ Add option" scaffolds right into the file. Ctrl+click opens source,
  double-click refocuses, SVG export.
- **DDS everywhere** — click any `.dds` for a zoomable preview (DXT1/3/5,
  BC7, uncompressed); convert PNG/JPEG/WebP to DDS from the explorer
  right-click (BC1/BC3/uncompressed, auto by transparency); **CK3: Show
  Image Guidelines** lists the sizes vanilla actually uses, measured from the
  game files.
- **Tools view** — the whole toolbox (converter, tiger, launch, graphs,
  report, translations) as one-click items at the top of the CK3 activity
  bar, headed by **CK3: Open Tutorial**, a bundled 10-chapter modding course with
  every snippet verified against the game files.
- **GUI language support** — `.gui` files get completion (properties ranked
  by real vanilla usage per widget type, `using =` templates), hover with
  usage stats, and brace diagnostics. Go-to-definition resolves types,
  templates (incl. `local_template`) and `blockoverride` targets through
  `using` splices and base-type chains; template/type hover lists the block
  names you can override and the base chain.
- **Data types in `[ ... ]`** — `[Character.` completes `IsAlive`, `GetFather`,
  … in `.gui` and localization files, chaining through return types
  (`GetPlayer.GetFaith.`), with hover on every segment. Works out of the box
  from bundled wiki tables; run `DumpDataTypes` in the game console for the
  complete, version-exact set. Bracketed expressions also get structured
  highlighting plus quote and paren auto-closing.
- **GUI Widget Tree** — open any `.gui` file and hit the tree icon (or **CK3:
  Show GUI Widget Tree**): the PdxGui hierarchy as a collapsible tree with
  type badges, names, `using` refs and animation states; click to jump,
  filter, auto-refresh on save. `.gui` files also get full syntax
  highlighting.
- **CK3: Show Mod Report** — the whole dashboard as one markdown page.

### Workflow
- **CK3: New Content** — scaffolds for events, decisions, interactions and
  on_action hooks that are *correct by construction* (right folder, BOM'd loc
  stubs, namespace declared, append-pattern on_action hooks).
- **CK3: Launch CK3 (debug mode)** + **CK3: Toggle error.log Watcher** — run the game,
  see script errors appear as squiggles in the editor as they happen.
- **Translation** — scaffold a whole language (`CK3 Localization: Add Language`),
  then work through it with the coverage-driven `CK3 Localization: Translate Missing Keys` loop.
- Snippets for the common blocks, a conservative formatter (indentation only),
  and **CK3: Open Format Docs (.info)** for Paradox's own folder documentation.

## Setup

1. Install the extension, open your mod folder, run **CK3: Run Setup & Health
   Check** — it finds the game via Steam, checks the logs folder and offers to
   download ck3-tiger. The walkthrough covers the rest.
2. *(Recommended)* Launch CK3 with `-debug_mode`, open the console (\`), run
   `script_docs`, then **CK3: Reload Game Data (script_docs)**. This upgrades the
   token data from the bundled wiki lists to your exact game version, including
   modifiers and scope-transition data for the scope engine.

### Settings

| Setting | Meaning |
|---|---|
| `ck3.gamePath` | `.../steamapps/common/Crusader Kings III/game` (auto-detected via Setup) |
| `ck3.logsPath` | folder with the `script_docs` logs; empty = auto-detect Documents |
| `ck3.tigerPath` | ck3-tiger binary; empty = the auto-downloaded copy |
| `ck3.modPath` | mod folder; empty = first workspace folder |
| `ck3.parentMods` | parent/dependency mod folders (load order, base first) indexed alongside the mod |
| `ck3.locLanguage` | reference localization language (default `english`) |
| `ck3.tigerRunOn` | `save` (debounced) or `manual` |
| `ck3.scopeInlayHints` | show inferred scope after block openers (default off) |
| `ck3.enableForWorkspace` | escape hatch for the txt/yml language switching |
| `ck3.diagnostics.ignore` | diagnostic codes to suppress everywhere (ours + tiger keys) |
| `ck3.diagnostics.ignorePatterns` | globs (workspace-relative paths) whose diagnostics are suppressed |
| `ck3.diagnostics.vanilla` | diagnose files under `ck3.gamePath` (default off: mod files only) |
| `ck3.trace.server` | LSP trace level `off`/`messages`/`verbose` (default off) |

Suppress diagnostics inline with a comment: `# ck3m:ignore <code…>` on the
offending line, or `# ck3m:ignore-next-line <code…>` above it; a bare
`# ck3m:ignore` suppresses every diagnostic on the line. Codes are the
extension's own (`missing-bom`, `unclosed-brace`, `stray-close`,
`unterminated-string`, `missing-value`, `wrong-on-action-folder`,
`unknown-event`, `missing-required-loc`, `loc-header-mismatch`,
`loc-bad-filename`, `wrong-localization-folder`, `loc-no-header`,
`loc-bad-entry`, `loc-tab-indent`, `loc-unterminated-value`,
`loc-content-before-header`) or a ck3-tiger report key. This works for both the
extension's structural checks and ck3-tiger's reports.

### Working on submods and compatibility patches

Multiple mods can be loaded at once, CW Tools style. Parent mods come from any
of three places (all merged, first match wins on duplicates):

1. **Extra workspace folders** — open your submod plus its parent mods in a
   multi-root workspace (*File → Add Folder to Workspace*); every additional
   folder that looks like a CK3 mod is indexed automatically. The first
   workspace folder stays the mod being worked on.
2. The `ck3.parentMods` setting (absolute paths, load order, base first).
3. `<mod>/.ck3modding/playset.json` (below).

Parent content gets full syntax highlighting and language features, is indexed
between your mod and vanilla (completion, hover, go-to-definition,
find-references from your mod resolve into parents), shows up in the
overrides view, and re-indexes live when a parent file changes.

### Workspace files (optional, in `<mod>/.ck3modding/`)

- `playset.json` — `{ "parents": ["path/to/parent/mod", ...] }`: index parent
  mods so total-conversion submods resolve names correctly.
- `schema.json` — extend/override the bundled type schema (folders → kinds →
  loc requirements) for frameworks the extension doesn't know.
- `tiger-baseline.json` — written by **CK3 Tiger: Create Baseline**.

## Architecture

Client/server split (LSP): the VS Code extension host only runs the thin
client (language modes, tiger process, views, commands); all parsing, indexing
and analysis lives in a separate language-server process. The parser is a
hand-written, error-tolerant CST parser validated against the entire vanilla
corpus (0 exceptions, ~2s). The index is schema-driven — one small,
community-editable table (`shared/src/schema/ck3Schema.ts`, ~90 entries, all
verified against a live install) maps folders to definition kinds, loc
requirements, root scopes and cross-reference fields. Scope inference ranks
and annotates but *never* diagnoses. Design rationale and the full plan:
[`docs/rework-plan.md`](docs/rework-plan.md) and
[`docs/research.md`](docs/research.md); per-diagnostic docs under
[`docs/diagnostics/`](docs/diagnostics/).

## Upstream sources & acknowledgements

Everything the extension "knows" is derived from a verifiable source. These are
the repositories, projects and data sets this project uses or learned from:

| Source | What we use it for | License / terms |
|---|---|---|
| [Crusader Kings III](https://www.paradoxinteractive.com/games/crusader-kings-iii) game files (Paradox Interactive) | The primary ground truth: the bundled schema layers are *derived metadata* harvested from the game's own `_*.info` docs (`shared/data/structures.json`), the vanilla `gui/` tree (`shared/data/guiSchema.json`), vanilla usage counts (`shared/data/freqs.json`), and measured texture dimensions (`media/image-guidelines.md`). No game assets are redistributed. | Game content © Paradox Interactive; requires your own install |
| [jesec/ck3-modding-wiki](https://github.com/jesec/ck3-modding-wiki) | The bundled fallback token lists in `wikidocs/` (effects/triggers/scopes), a Markdown mirror of the official [CK3 wiki](https://ck3.paradoxwikis.com/Category:Modding) | CC BY-SA 3.0 — see [wikidocs/ATTRIBUTION.md](wikidocs/ATTRIBUTION.md) |
| [amtep/ck3-tiger](https://github.com/amtep/tiger) | The validator behind the diagnostics integration; auto-downloaded from its releases at the user's request, never bundled | GPL-3.0 (separate program, invoked as a process) |
| [microsoft/vscode](https://github.com/microsoft/vscode) | `test/vscodeFuzzy.ts` is a faithful port of the suggest widget's scoring (`filters.ts` fuzzyScore + `completionModel.ts` semantics) so tests can measure exactly what users see | MIT |
| [cwtools/cwtools-vscode](https://github.com/cwtools/cwtools-vscode), [cwtools](https://github.com/cwtools/cwtools), [cwtools-ck3-config](https://github.com/cwtools/cwtools-ck3-config) | Landscape research and design inspiration (settings surface, validation-feature catalog) | MIT |
| [Frostbite-time/EventGeneratingForCK3](https://github.com/Frostbite-time/EventGeneratingForCK3) | Feature reference for the event-graph workbench (inline loc editing, chain visualization) | — |
| *A Game of Thrones* (Steam Workshop [2962333032](https://steamcommunity.com/sharedfiles/filedetails/?id=2962333032)) and *Princes of Darkness* ([2216659254](https://steamcommunity.com/sharedfiles/filedetails/?id=2216659254)) | Corpus evidence: real-world usage frequencies for completion ranking and the design-pattern notes; only aggregate counts ship | Workshop content © their authors |
| [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node) | The LSP client/server runtime (`vscode-languageclient`, `vscode-languageserver`, `-textdocument`, `vscode-jsonrpc`, `vscode-uri`) | MIT |

## Also in this repo

- `skills/ck3-modding/` — a Claude/agent **skill for CK3 modding itself**: workflow, per-system
  recipes, ck3-tiger validation routine, and distilled pattern notes from two large Workshop mods.
  Copy the folder into your agent's skills directory; machine paths are placeholders it resolves
  per its Step 0. Not part of the extension.
- `docs/gui-designer/` — the in-game **layout calibration campaign** behind the GUI preview:
  the measured spec (`calibration/spec.md`) plus four batches of screenshot evidence, mirrored
  as golden fixtures in `test/guiLayout.test.ts`.

## Development

```
pnpm install
pnpm run compile      # esbuild bundles: dist/extension.js (client) + dist/server.js
pnpm run typecheck
pnpm test             # vitest; configure dev-paths.json (copy dev-paths.example.json) to also run the vanilla corpus suites
node dist/bench.cjs <gamePath>   # after: npx esbuild scripts/bench.ts --bundle --platform=node --outfile=dist/bench.cjs
```

Layout: `client/` (VS Code integration) · `server/` (language server: parser,
index, scopes, features, overview) · `shared/` (types, wire protocol, schema
table) · `test/` (vitest suites incl. corpus/fixture tests).

## Manual smoke checklist

1. Open a mod folder → status bar shows indexing, then counts; typing stays
   responsive during the vanilla scan.
2. Delete a `}` in an event file → one `unclosed-brace` error at the opening
   brace; outline still shows events below the gap.
3. Save a loc file without BOM → `missing-bom` error; fix encoding → clears.
4. Inside `every_held_title = {` completion ranks title effects first;
   character-only effects say "other scope" but are still there.
5. F12 / Shift+F12 / F2 on a mod scripted effect: definition, all usages,
   rename preview across script + loc.
6. Hover a trait icon `.dds` path → image renders; mod-shadowed path shows the
   mod's version.
7. CK3 view: overview counts match `CK3: Show Index Statistics`; delete a loc key →
   appears under Missing within ~2s of save.
8. `CK3: Show Event Graph` on an event id → chain renders; double-click
   refocuses; export writes an SVG.
9. Tiger: save a file with `has_trait = not_a_trait` → tiger report appears;
   create baseline → it disappears; introduce a new error → only that shows.
10. `CK3: New Content` → event: files parse clean, loc keys resolve, game
    loads them (folder/encoding correct by construction).
11. `CK3: Toggle error.log Watcher` + `CK3: Launch CK3 (debug mode)` → trigger a script
    error in game → squiggle appears in the editor within ~2s.

## License

GPL-3.0-or-later. In short: use, modify and redistribute freely, but any
distributed fork or derivative must publish its source under the GPL too.
See [LICENSE](LICENSE). Bundled third-party data keeps its own terms
(wikidocs/ is CC BY-SA, see wikidocs/ATTRIBUTION.md; full table above).
