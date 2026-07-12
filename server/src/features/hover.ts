/**
 * Hover: engine-token docs (script_docs/wiki), indexed-definition summaries,
 * block-schema structure keys (§B2) and saved-scope cards for `scope:`/`var:`
 * references (§B3).
 *
 * The data-gathering here builds `CardInput` records; visual assembly (badges,
 * scope pills, fenced examples, the single shared scope footer) lives in
 * `hoverRender.ts` so the D2 layout is unit-tested without LSP types.
 */
import { MarkupKind, type Hover, type Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import * as path from "path";
import { URI } from "vscode-uri";
import type { Ck3SchemaEntry } from "../../../shared/src/schema/types";
import type { TokenData } from "../../../shared/src/types";
import type { ServerData } from "../serverData";
import type { SchemaData } from "../schema/loader";
import { scopePrefixBefore, wordRangeAt } from "../wordAt";
import { getLineText } from "../documents";
import { getParse, getSavedScopes } from "../parseCache";
import { structureContextAt } from "../structure";
import { inferScopeAt } from "../scopes/inference";
import { inferenceContextFor, variableTypes } from "../scopes/varTypes";
import { nodeAtOffset, walkStatements } from "../parser";
import type { RefField } from "../../../shared/src/schema/types";
import { BLOCK_REF_FIELDS, VAR_PREFIX_KINDS } from "../../../shared/src/schema/ck3Schema";
import { KEYWORD_DOCS, scopeWordDoc } from "../data/keywordDocs";
import type { Scope } from "../scopes/model";
import {
  renderCard,
  renderDocBody,
  renderHover,
  scopeHereLine,
  scopePill,
  scopeType,
  type CardInput,
} from "./hoverRender";
import type { Definition } from "../../../shared/src/types";

export function provideHover(
  data: ServerData,
  document: TextDocument,
  position: Position,
  rootScopes: Set<Scope> | null,
  entry: Ck3SchemaEntry | null = null,
  getSchema?: () => SchemaData
): Hover | null {
  const lineText = getLineText(document, position.line);
  let range = wordRangeAt(lineText, position.character);
  if (!range) return null;
  // Dot chains (`root.location.county`) resolve per segment under the cursor;
  // event ids (`namespace.5.a`, any all-digit segment) stay whole.
  if (range.word.includes(".") && !range.word.split(".").some((p) => /^\d+$/.test(p))) {
    let start = range.start;
    for (const part of range.word.split(".")) {
      const end = start + part.length;
      if (position.character <= end) {
        range = { word: part, start, end };
        break;
      }
      start = end + 1;
    }
  }
  const word = range.word;

  const cards: string[] = [];

  // Current scope at the cursor, computed once and shared by the pills and the
  // single footer line (§D2/§D3). null when we can't infer.
  const current = currentScopes(data, document, position, rootScopes, entry);

  // `scope:x` / `var:x` reference under the cursor → saved-scope card (§B3).
  const prefix = scopePrefixBefore(lineText, range);
  if (prefix === "scope") {
    const card = savedScopeCard(data, document, word, rootScopes, entry);
    if (card) cards.push(card);
  } else if (prefix === "var" || prefix === "local_var" || prefix === "global_var") {
    // Typed variable card: value type from the mod-wide set-site analysis, plus
    // set-site links (namespace-correct: var/local_var/global_var are distinct).
    const varInfo = variableTypes(data, data.rootScopesForFile);
    const typed = varInfo.types.get(`${prefix}:${word}`);
    const itemTyped = varInfo.listItemTypes.get(`${prefix}:${word}`);
    const headTail = typed
      ? `→ ${[...typed].map(scopeType).join(" | ")}`
      : itemTyped
        ? `→ list of ${[...itemTyped].map(scopeType).join(" | ")}`
        : itemTyped === null
          ? `→ list`
          : `· ${prefix.replace(/_/g, " ")}`;
    const setDefs = data.index
      .lookup(word)
      .filter((d) => VAR_PREFIX_KINDS[prefix].includes(d.kind))
      .slice(0, 3);
    const doc =
      setDefs.length > 0
        ? setDefs
            .map((d) => `set in [${path.basename(d.file)}:${d.line + 1}](${URI.file(d.file)}#L${d.line + 1})`)
            .join("  \n")
        : undefined;
    cards.push(
      renderCard({ kind: "saved_scope", badgeLabel: "variable", name: word, headTail, doc })
    );
  }

  // When the word is the VALUE of a schema ref field (`theme = faith`,
  // `add_trait = brave`), the schema names the kinds it can reference — show
  // only those meanings instead of every same-named symbol (the `faith` event
  // target is noise on `theme = faith`). Falls through when nothing matches.
  const expected = getSchema ? refKindsAt(document, position, getSchema().refFields) : null;
  const defs = data.index.lookup(word);
  const expectedDefs = expected ? defs.filter((d) => expected.includes(d.kind)) : [];

  if (expectedDefs.length > 0) {
    for (const def of expectedDefs) cards.push(definitionCard(data, def));
  } else {
    for (const token of data.tokenMap.get(word) ?? []) {
      cards.push(tokenCard(token, current));
    }
    for (const def of defs) {
      cards.push(definitionCard(data, def));
    }
  }

  // Fallback cards, only when nothing else matched, so a real token/def with
  // the same name keeps precedence. Most-specific first: block structure key,
  // enum value of a structure key, macro parameter of the called scripted
  // effect/trigger, event namespace, scope keyword, grammar keyword.
  if (!prefix && cards.length === 0) {
    const card =
      (entry?.kind && getSchema ? structureKeyCard(document, position, word, entry, getSchema) : null) ??
      (entry?.kind && getSchema ? enumValueCard(document, position, word, entry, getSchema) : null) ??
      macroParamCard(data, document, position, word) ??
      relationTriggerCard(data, word) ??
      namespaceCard(data, word) ??
      scopeWordCard(word) ??
      keywordCard(word) ??
      effectArgumentCard(data, document, position, word);
    if (card) cards.push(card);
  }

  if (cards.length === 0) return null;

  // Scope context appears once, last (§D2). Suppressed for a `scope:` hover
  // (its own card already carries the scope) to match the prior behavior.
  let footer: string | null = null;
  if (prefix !== "scope") {
    const scopes = current && current.size > 0 ? [...current].join(" | ") : "unknown";
    const inference = scopeInference(data, document, position, rootScopes, entry);
    const chain = inference.chain.length > 1 ? inference.chain.join(" · ") : null;
    footer = scopeHereLine(scopes, chain);
  }

  return {
    contents: { kind: MarkupKind.Markdown, value: renderHover(cards, footer) },
    range: {
      start: { line: position.line, character: range.start },
      end: { line: position.line, character: range.end },
    },
  };
}

/** An engine-token card: badge, name, scope pills, doc, traits (§D2 mock 1). */
function tokenCard(token: TokenData, current: ReadonlySet<string> | null): string {
  const card: CardInput = { kind: token.kind, name: token.name };
  card.doc = token.doc || undefined;
  if (token.traits) card.traits = token.traits.split("\n").join(" · ");
  const footer: string[] = [];
  if (token.scopes.length > 0) {
    footer.push(`Supported scopes: ${token.scopes.map((s) => scopePill(s, current)).join(" ")}`);
  }
  if (footer.length > 0) card.footer = footer;
  return renderCard(card);
}

/** An indexed-definition card: badge, name, `· source`, provenance link (§D2 mock 2). */
function definitionCard(data: ServerData, def: ReturnType<ServerData["index"]["lookup"]>[number]): string {
  const card: CardInput = { kind: def.kind, badgeLabel: def.kind.replace(/_/g, " "), name: def.name };
  card.headTail = `· ${def.source}`;
  if (def.kind === "loc_key" && def.value !== undefined) card.doc = `"${def.value}"`;

  // Doc-comment prose + structured tags (§E3). Prose first, then tags; `@example`
  // fills the fenced slot; `@deprecated` strikes the name. Empty when absent.
  const body = extractDoc(def);
  if (body.doc) card.doc = body.doc;
  if (body.example) card.example = body.example;
  if (body.deprecated) card.name = `~~${def.name}~~`;

  const footer: string[] = [provenance(def)];
  const refs = data.refIndex.usageCount(def.name);
  if (refs > 0) footer.push(`${refs.toLocaleString("en-US")} reference${refs === 1 ? "" : "s"}`);
  card.footer = footer;
  return renderCard(card);
}

/** `file.txt:line` provenance, as a markdown link when a file URI is feasible. */
function provenance(def: { file: string; line: number }): string {
  const label = `${path.basename(def.file)}:${def.line + 1}`;
  // Plain text when no absolute path is available (fail-soft, e.g. synthetic defs).
  if (!def.file || !path.isAbsolute(def.file)) return label;
  const target = URI.file(def.file).with({ fragment: String(def.line + 1) }).toString();
  return `[${label}](${target})`;
}

/**
 * Doc-comment / example extraction (§D2 mock 2, §E3). Reads the CK3Doc fields
 * captured at index time (`Definition.doc`/`.tags`) and renders prose + tags.
 * Fail-soft: an undocumented definition yields an empty body.
 */
function extractDoc(def: Definition): ReturnType<typeof renderDocBody> {
  return renderDocBody(def);
}

/** A saved-scope card: badge, name, `→ type`, save-site link, ambient doc (§D2 mock 3). */
function savedScopeCard(
  data: ServerData,
  document: TextDocument,
  name: string,
  rootScopes: Set<Scope> | null,
  entry: Ck3SchemaEntry | null
): string {
  const ambient = entry?.ambientScopes?.find((a) => a.name === name);
  const saved = getSavedScopes(document, data.scopeModel, rootScopes, entry?.ambientScopes, inferenceContextFor(data, entry));
  const inferred = saved.get(name);
  const type = ambient?.type ?? (inferred && inferred.size > 0 ? [...inferred].join(" | ") : "unknown");

  const card: CardInput = {
    kind: "saved_scope",
    name: `scope:${name}`,
    headTail: `→ ${scopeType(type)}`,
  };

  const doc: string[] = [];
  if (ambient) doc.push(`${ambient.doc}${entry ? ` *(${entry.kind.replace(/_/g, " ")})*` : ""}`);

  const site = firstSaveSite(document, name);
  if (site !== null) doc.push(`Saved in this file: ${path.basename(URIToPath(document.uri))}:${site + 1}`);
  else if (ambient) doc.push(`Engine-provided (not saved in this file).`);
  else if (!inferred) doc.push(`Saved elsewhere in the mod.`);

  if (doc.length > 0) card.doc = doc.join("  \n");
  return renderCard(card);
}

/** Line (0-based) of the first `save_scope_as`/`save_temporary_scope_as = name` in the file. */
function firstSaveSite(document: TextDocument, name: string): number | null {
  const { result, lineIndex } = getParse(document);
  let line: number | null = null;
  walkStatements(result.root, (stmt) => {
    if (line !== null) return;
    if (stmt.kind !== "assignment" || stmt.key.quoted) return;
    if (stmt.key.text !== "save_scope_as" && stmt.key.text !== "save_temporary_scope_as") return;
    if (stmt.value?.kind === "scalar" && !stmt.value.quoted && stmt.value.text === name) {
      line = lineIndex.positionAt(stmt.value.range.start).line;
    }
  });
  return line;
}

/** A structure-key card: KeySpec doc plus provenance (§B2). */
function structureKeyCard(
  document: TextDocument,
  position: Position,
  word: string,
  entry: Ck3SchemaEntry,
  getSchema: () => SchemaData
): string | null {
  const { result, lineIndex } = getParse(document);
  const offset = lineIndex.offsetAt(position);
  const ctx = structureContextAt(result, offset, entry.kind, getSchema().structures);
  if (!ctx) return null;
  const spec = ctx.keys.get(word);
  if (!spec) return null;
  const source = getSchema().structures.source(entry.kind) ?? entry.kind;
  const where = ctx.block ? `in \`${ctx.block}\`` : "";
  const card: CardInput = {
    kind: "structure_key",
    badgeLabel: `${entry.kind.replace(/_/g, " ")} key`,
    name: word,
  };
  if (where) card.headTail = where;
  card.doc = spec.doc ? `${spec.doc} *(${source})*` : `*(${source})*`;
  return renderCard(card);
}

/** `type = character_event` — the value is a member of the key's structure enum. */
function enumValueCard(
  document: TextDocument,
  position: Position,
  word: string,
  entry: Ck3SchemaEntry,
  getSchema: () => SchemaData
): string | null {
  const { result, lineIndex } = getParse(document);
  const offset = lineIndex.offsetAt(position);
  const hit = nodeAtOffset(result.root, offset);
  const last = hit?.path[hit.path.length - 1];
  if (!last || last.kind !== "assignment" || last.key.quoted) return null;
  if (last.value?.kind !== "scalar" || last.value.quoted) return null;
  if (offset < last.value.range.start || offset > last.value.range.end) return null;
  const ctx = structureContextAt(result, offset, entry.kind, getSchema().structures);
  const spec = ctx?.keys.get(last.key.text);
  if (!spec?.values?.startsWith("enum:")) return null;
  const members = spec.values.slice(5).split("|");
  if (!members.includes(word)) return null;
  return renderCard({
    kind: "structure_key",
    badgeLabel: `${last.key.text} value`,
    name: word,
    doc: `One of: ${members.map((m) => (m === word ? `**${m}**` : m)).join(" · ")}`,
  });
}

/** `my_effect = { AMOUNT = 3 }` — the key is a $PARAM$ of the called scripted effect/trigger. */
function macroParamCard(
  data: ServerData,
  document: TextDocument,
  position: Position,
  word: string
): string | null {
  const { result, lineIndex } = getParse(document);
  const offset = lineIndex.offsetAt(position);
  const hit = nodeAtOffset(result.root, offset);
  const last = hit?.path[hit.path.length - 1];
  if (!last || last.kind !== "assignment" || last.key.quoted) return null;
  if (offset < last.key.range.start || offset > last.key.range.end) return null;
  const enclosing = hit!.path[hit!.path.length - 2];
  if (!enclosing || enclosing.kind !== "assignment" || enclosing.key.quoted) return null;
  const callee = enclosing.key.text;
  for (const def of data.index.lookup(callee)) {
    if (def.kind !== "scripted_effect" && def.kind !== "scripted_trigger") continue;
    if (!def.params?.includes(word)) continue;
    return renderCard({
      kind: "macro_param",
      badgeLabel: "parameter",
      name: word,
      headTail: `of ${def.kind.replace(/_/g, " ")} \`${callee}\``,
      doc: `Replaces \`$${word}$\` in the ${def.kind.replace(/_/g, " ")}'s body.`,
    });
  }
  return null;
}

/**
 * `has_relation_dao_guide` — triggers/effects the engine generates per scripted
 * relation (`has_relation_X`, `set_relation_X`, `remove_relation_X`).
 */
function relationTriggerCard(data: ServerData, word: string): string | null {
  const m = /^(has|set|remove)_relation_([A-Za-z0-9_]+)$/.exec(word);
  if (!m) return null;
  const def = data.index.lookup(m[2]).find((d) => d.kind === "scripted_relation");
  if (!def) return null;
  const verb = m[1] === "has" ? "Trigger: the scoped character has" : m[1] === "set" ? "Effect: gives the scoped character" : "Effect: removes the scoped character's";
  return renderCard({
    kind: m[1] === "has" ? "trigger" : "effect",
    name: word,
    headTail: `· generated from \`${m[2]}\``,
    doc: `${verb} the scripted relation \`${m[2]}\` (${path.basename(def.file)}:${def.line + 1}) with the target character.`,
  });
}

/**
 * `start_scheme = { target_character = … }` — the key is a block argument of an
 * engine effect/trigger call; surface the call's own doc, which describes its
 * arguments. Last-resort fallback: anything more specific wins.
 */
function effectArgumentCard(
  data: ServerData,
  document: TextDocument,
  position: Position,
  word: string
): string | null {
  const { result, lineIndex } = getParse(document);
  const offset = lineIndex.offsetAt(position);
  const hit = nodeAtOffset(result.root, offset);
  const last = hit?.path[hit.path.length - 1];
  if (!last || last.kind !== "assignment" || last.key.quoted) return null;
  if (offset < last.key.range.start || offset > last.key.range.end) return null;
  const enclosing = hit!.path[hit!.path.length - 2];
  if (!enclosing || enclosing.kind !== "assignment" || enclosing.key.quoted) return null;
  const token = data.tokenMap.get(enclosing.key.text)?.[0];
  if (!token) return null;
  const card: CardInput = {
    kind: "structure_key",
    badgeLabel: "argument",
    name: word,
    headTail: `of ${token.kind.replace(/_/g, " ")} \`${token.name}\``,
  };
  if (token.doc) card.doc = token.doc;
  return renderCard(card);
}

/** `cultivation_ruin` in `trigger_event = cultivation_ruin.5` etc. — a declared event namespace. */
function namespaceCard(data: ServerData, word: string): string | null {
  if (!data.modNamespaces.has(word)) return null;
  return renderCard({
    kind: "namespace",
    badgeLabel: "event namespace",
    name: word,
    doc: `Events in this namespace are named \`${word}.<n>\`.`,
  });
}

/** root/ROOT/this/prev(prev…)/from(from…) — scope navigation keywords. */
function scopeWordCard(word: string): string | null {
  const hit = scopeWordDoc(word);
  if (!hit) return null;
  return renderCard({ kind: "scope_word", badgeLabel: "scope", name: hit.name, doc: hit.doc });
}

/** Grammar/math glue vocabulary (limit, NOT, base, days…): curated docs. */
function keywordCard(word: string): string | null {
  const doc = KEYWORD_DOCS[word];
  if (!doc) return null;
  return renderCard({ kind: "keyword", name: word, doc });
}

/**
 * The definition kinds a ref field expects at this position, when the cursor
 * sits on the VALUE of such a field (`theme = X` scalar form, `events = { X }`
 * list form). null anywhere else — key position, non-ref keys, quoted values.
 */
function refKindsAt(
  document: TextDocument,
  position: Position,
  refFields: Map<string, RefField>
): string[] | null {
  const { result, lineIndex } = getParse(document);
  const offset = lineIndex.offsetAt(position);
  const hit = nodeAtOffset(result.root, offset);
  if (!hit) return null;
  const last = hit.path[hit.path.length - 1];

  // `key = word` — scalar value of an assignment.
  if (
    last.kind === "assignment" &&
    !last.key.quoted &&
    last.value?.kind === "scalar" &&
    !last.value.quoted &&
    offset >= last.value.range.start &&
    offset <= last.value.range.end
  ) {
    const field = refFields.get(last.key.text);
    if (field) return field.form !== "list" ? field.kinds : null;
    // Block-scoped ref keys (`trigger_event = { id = X }`,
    // `override_background = { reference = X }`).
    const enclosing = hit.path[hit.path.length - 2];
    if (enclosing?.kind === "assignment" && !enclosing.key.quoted) {
      return BLOCK_REF_FIELDS[enclosing.key.text.toLowerCase()]?.[last.key.text] ?? null;
    }
    return null;
  }

  // `key = { word ... }` — bare list element; the owning assignment is one up.
  if (last.kind === "value" && last.value.kind === "scalar" && !last.value.quoted) {
    const parent = hit.path[hit.path.length - 2];
    if (parent?.kind === "assignment" && !parent.key.quoted) {
      const field = refFields.get(parent.key.text);
      return field && field.form !== "scalar" ? field.kinds : null;
    }
  }
  return null;
}

/** The inferred scope set at the cursor, or null when inference is unavailable. */
function currentScopes(
  data: ServerData,
  document: TextDocument,
  position: Position,
  rootScopes: Set<Scope> | null,
  entry: Ck3SchemaEntry | null
): Set<string> | null {
  const inference = scopeInference(data, document, position, rootScopes, entry);
  return inference.scopes && inference.scopes.size > 0 ? inference.scopes : null;
}

function scopeInference(
  data: ServerData,
  document: TextDocument,
  position: Position,
  rootScopes: Set<Scope> | null,
  entry: Ck3SchemaEntry | null
): ReturnType<typeof inferScopeAt> {
  const { result, lineIndex } = getParse(document);
  const offset = lineIndex.offsetAt(position);
  const ictx = inferenceContextFor(data, entry);
  return inferScopeAt(
    result,
    offset,
    data.scopeModel,
    rootScopes,
    getSavedScopes(document, data.scopeModel, rootScopes, entry?.ambientScopes, ictx),
    ictx
  );
}

function URIToPath(uri: string): string {
  return uri.replace(/^file:\/\/\/?/, "").replace(/\//g, path.sep);
}
