# AGENTS.md — orientation for AI agents working in this repo

## What this project is

A VS Code extension ("CK3 Modding Toolkit", id `ck3-modding-toolkit`) that gives Crusader
Kings III mod authors a full language workbench: an LSP server with a
hand-written tolerant parser for Paradox/Jomini script, grammar-aware
completion, hover docs, diagnostics for the silent-failure class of bugs,
ck3-tiger integration, an editable event-graph webview, DDS texture
preview/conversion, PdxGui support, localization tooling, and a bundled
tutorial.

**The one design idea that explains most decisions:** all language knowledge
is *derived from the game itself* — the user's `script_docs` logs, the vanilla
files, harvested `_*.info` schema docs, and real-corpus usage counts — never
hand-maintained rule files (that is what killed CWTools). If you are about to
hard-code a trigger/effect/property name from memory, stop: find it in the
game files or a harvest, or don't add it.

## Non-negotiable invariants

- **AD-5 "annotate, never hide":** scope inference ranks and labels completion
  items but emits zero diagnostics and never removes an item for scope
  reasons. (Server-side word-filtering/capping is fine — it mirrors what the
  client drops anyway.)
- **Deep validation belongs to ck3-tiger,** not us. Our own diagnostics stay
  structural and certain (braces, encodings, folder traps).
- **CK3 fails silently.** Every writer in this repo must produce files that
  are correct by construction: loc yml = UTF-8 **with BOM** + `l_<lang>:`
  header + `_l_<lang>.yml` filename; script `.txt` = UTF-8 with BOM (vanilla
  ships BOMs everywhere; tiger warns otherwise); event files START with their
  `namespace =` line.
- **`localization/replace/` is only for overriding vanilla keys.** New keys go
  to the mod loc file holding their siblings (`writeLocSmart` /
  `upsertNewModLoc` in `client/src/locCommands.ts`).
- **Override rules:** script databases are last-in-wins (LIOS), `gui/` and
  `localization/replace` are first-in-wins (FIOS).
- **No `vscode` imports** in `server/` or `shared/` modules that carry logic —
  they must be unit-testable in plain Node. UI-only code lives in `client/`.
- The parse cache (`server/src/parseCache.ts`) is keyed by **uri + version**.
  In tests and scripts, use a fresh URI per document text or you will get a
  stale parse (this has bitten twice).

## Repo map

| Path | What lives there |
|---|---|
| `client/src/` | Extension host: language-mode switching, tiger runner + download, views (`views.ts`), webview panels (`webviews/eventGraph`, `webviews/guiTree`), DDS editor/converter, loc commands, scaffolds (`scaffold/`), setup |
| `server/src/` | The LSP server. `parser/` (tolerant CST, encoding), `index/` (definition/reference indexing, extraction modes), `features/` (completion, hover, guiLanguage, diagnostics, semantic tokens, …), `scopes/` (inference), `overview/` (graph, event detail, coverage, overrides), `schema/loader.ts` |
| `shared/src/` | Wire protocol (`protocol.ts`), schema table (`schema/ck3Schema.ts` + `structures.ts` + `ambientScopes.ts`), translation core, suppression, tiger report parser |
| `shared/data/` | Bundled harvested data: `freqs.json` (usage counts), `structures.json` (all `_*.info` keys), `guiSchema.json` (widget vocabulary). JSON-imported, inlined into the server bundle |
| `test/` | Vitest suites. `vscodeFuzzy.ts` = faithful port of VS Code's suggest scoring; `rankEvalCore.ts` = ranking eval harness; `lspSmoke.test.ts` forks the real bundle over node IPC |
| `scripts/` | Build-time harvests and evals (see "Regenerating data") |
| `wikidocs/` | Bundled wiki token lists (CC BY-SA, see its ATTRIBUTION.md) — the fallback when the user has no `script_docs` logs |
| `media/` | Icon, walkthrough pages, `image-guidelines.md`, `tutorial/` (10-chapter course). `media/` SHIPS in the vsix; `docs/` does NOT |
| `docs/` | Tracked: `diagnostics/` (per-code explanations, linked from README + diagnostic codes), `gui-designer/` (the in-game layout-calibration campaign: spec + evidence), `guides/` (UI-modding guide + screenshots, referenced by the skill). Everything else (design history: `rework-plan.md`, `UPDATE_PLAN_v1.1.md`, `research.md`, …) is LOCAL-ONLY, gitignored |
| `skills/ck3-modding/` | A Claude/agent skill for CK3 modding itself (not the extension): routing table, per-system recipes, validation workflow, distilled AGOT/PoD pattern notes. Machine-agnostic: paths appear as `<game>`/`<logs>`/`<mods>`/`<workshop>`/`<tiger>` placeholders resolved per SKILL.md Step 0. Excluded from the vsix |
| `syntaxes/` | TextMate grammars (`paradox`, `paradox-loc`, `paradox-info` for the game's `_*.info` format docs, `paradox-mod` for .mod descriptors; `paradox-gui` reuses the script grammar) |

Feature routing (most-touched files): completion ranking →
`server/src/features/completion.ts`; context detection →
`server/src/context.ts` + `contextKeywords.ts`; gui language →
`features/guiLanguage.ts`; `[ ... ]` datafunctions →
`features/datafunction.ts` + `data/dataTypes.ts` (wiki/dump tables) +
`data/dataFnUsage.ts` (cached runtime harvest of vanilla gui+loc usage) +
`data/dataFnDocs.ts` (curated/deduced descriptions); gui layout engine (designer preview) →
`server/src/gui/layoutEngine.ts` + `guiDefs.ts` (template/type store, FIOS)
(rules measured in `docs/gui-designer/calibration/spec.md`, fixtures in
`test/guiLayout.test.ts`);
descriptor.mod (completion/hover/diagnostics, missing-descriptor check) →
`client/src/descriptorMod.ts` + `shared/src/descriptorMod.ts` (field table, validator);
event graph/inspector →
`server/src/overview/eventGraph.ts` + `eventDetail.ts` +
`client/src/webviews/eventGraph/panel.ts`; DDS →
`server/src/dds/` (decoder + encoder, no vscode imports) +
`client/src/ddsEditor.ts` / `ddsConvert.ts`.

## Local machine paths (dev-paths.json)

Machine-specific paths (game folder, logs, your mod, an eval corpus mod,
ck3-tiger) live in ONE central place: `dev-paths.json` at the repo root,
gitignored — copy `dev-paths.example.json` and fill it in. Environment
variables override per key (`CK3_GAME_PATH`, `CK3_LOGS_PATH`, `CK3_MOD_PATH`,
`CK3_MOD_CORPUS`); the loader is `test/devPaths.ts`.
Corpus-gated tests skip when a path is unset; scripts print usage and exit.
Never hardcode a personal path in a tracked file. (The shipped extension does
not read any of this: at runtime, paths come from VS Code settings with
auto-inference.)

The base game files are THE source of truth for script syntax. Never guess
names; grep the game folder or the `_*.info` docs. The `~/.claude/skills/
ck3-modding` skill has distilled references if present.

## Build, test, package

```bash
pnpm install
pnpm run compile        # esbuild → dist/extension.js + dist/server.js
npx tsc --noEmit        # typecheck (esbuild does not check types)
npx vitest run          # fast suite (corpus-gated tests skip without env)

# Full gated suite (needs gamePath + corpusPath in dev-paths.json, or the env vars):
npx vitest run          # (rank eval alone takes ~4 min; exclude test/rankEval.test.ts when iterating)

# Package (npm-run "package" breaks under pnpm layout — use this):
npx vsce package --pre-release --no-dependencies
```

## Releasing

Branch model: `dev` = full working history, LOCAL-ONLY (never push it; the
remote was deliberately purged of history). `main` = the public face: the
initial commit plus ONE commit per release. To cut a release from dev:

```bash
git checkout main
git read-tree -u --reset dev      # main's tree becomes exactly dev's tree
git commit -m "v<version>: <summary>"
git push origin main
git tag v<version> && git push origin v<version>
```

(NOT `git merge` and not `git merge --squash` — with the disjoint histories
both produce add/add conflicts or drag dev's history into main.)

Then create a GitHub Release from the tag — the Release drives everything
(`.github/workflows/release.yml`):

- Release with "Set as a pre-release" checked → build, test, vsix attached
  to the Release, published to the Marketplace as a **pre-release**.
- Release without the checkbox → same, published as a **full release**.
- Deleting a Release (either kind) removes that version from the
  Marketplace, so the previous version is served as latest again
  (`scripts/marketplace-remove-version.mjs`).
- Manual `workflow_dispatch` remains as an escape hatch, e.g. to re-run a
  failed Marketplace publish without recreating the Release.

Needs the `VSCE_PAT` repo secret (Azure DevOps PAT, scope Marketplace→Manage)
and the publisher **JDeffner** created once at
marketplace.visualstudio.com/manage. Marketplace rules to keep in mind:

- A version number publishes exactly once — a version shipped as pre-release
  (e.g. 0.1.2) can never be promoted to a full release; bump instead.
- Keep the minor version odd while pre-release (0.1.x, 0.3.x) and even for
  full releases — Marketplace convention.
- Rollback only changes what the Marketplace serves; users who already
  auto-updated keep the deleted version until something newer ships.

Gotchas:
- Delete stray `dist/*.cjs` (harvest/eval bundles) before `vsce package` —
  everything in `dist/` ships.
- Git prints LF→CRLF warnings on commit; harmless, ignore.
- The vsix must stay self-contained: everything is esbuild-bundled, so new
  runtime npm deps are almost never the answer.

## Regenerating bundled data (per game patch)

All are esbuild-bundled scripts: `npx esbuild scripts/<name>.ts --bundle
--platform=node --outfile=dist/<name>.cjs && node dist/<name>.cjs` (then
delete the .cjs).

| Script | Output | What it does |
|---|---|---|
| `build-structures-json.ts` | `shared/data/structures.json` | Harvests every `_*.info` schema doc, validates keys against vanilla usage counts |
| `build-gui-schema.ts` | `shared/data/guiSchema.json` | Widget types + per-type property counts from the vanilla `gui/` tree |
| `build-freqs.ts` | `shared/data/freqs.json` | Per-context token/def usage counts (vanilla + corpus) |
| `audit-schema-coverage.ts` | stdout | Compares CK3_SCHEMA + structures.json against every game `_*.info` and common/ folder; run per patch, gaps should be 0 or documented |
| `rank-eval.ts` / `fuzzy-diag.ts` | stdout | Completion-quality measurement: rank-eval replays real corpus positions; fuzzy-diag replays typed prefixes through VS Code's own scoring — run BEFORE and AFTER any ranking change |

## Testing philosophy

- Logic lives in `server/`/`shared/` without vscode imports so vitest covers
  it directly; `client/` UI code is exercised by the IPC smoke test and live
  passes.
- `test/lspSmoke.test.ts` forks `dist/server.js` with `--node-ipc` exactly
  like the real client — the headless stand-in for a live VS Code pass. Extend
  it when adding protocol surface.
- Completion changes MUST be justified with `fuzzy-diag`/`rank-eval` numbers,
  not vibes: the suggest widget's behavior is simulated exactly by
  `test/vscodeFuzzy.ts` (keep it in lockstep with upstream if VS Code changes).
- Scaffold/writer changes should be validated against the real ck3-tiger on a
  scratch mod (descriptor.mod + the generated files).

## Conventions

- User-facing prose (README, CHANGELOG entries, tutorial, UI copy) avoids
  em dashes; code comments follow the existing style.
- Comments state constraints and provenance ("measured", "per §C2"), not
  narration of the code below them.
- Commit messages explain the WHY with measured numbers where they exist;
  version bumps follow feature releases (see CHANGELOG.md for the shape).
- The task history and per-release evidence live in CHANGELOG.md and
  `docs/`; read `docs/UPDATE_PLAN_v1.1.md` before redesigning completion.

## Upstream sources

See "Upstream sources & acknowledgements" in [README.md](README.md) — every
external repository, data set and reference this project uses, with licenses.
When you add a new one, extend that table AND this line's neighbor files
(wikidocs/ATTRIBUTION.md pattern) as appropriate.
