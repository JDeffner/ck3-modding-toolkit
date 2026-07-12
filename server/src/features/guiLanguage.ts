/**
 * PdxGui language features (paradox-gui): completion, hover and template
 * navigation for .gui files, grounded in a build-time harvest of the vanilla
 * gui/ tree (shared/data/guiSchema.json: 600+ widget types with per-type
 * property usage counts) plus the definition index's gui_type entries
 * (mod + vanilla `template X { }` / `type x = base { }` declarations).
 */
import { CompletionItemKind, MarkupKind, type CompletionItem, type Hover, type Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import GUI_SCHEMA_JSON from "../../../shared/data/guiSchema.json";
import type { ServerData } from "../serverData";
import { blockStackFromParse } from "../context";
import { getParse } from "../parseCache";
import { finalize, MAX_ITEMS, type CompletionResult } from "./completion";
import { provideDataFnCompletion, provideDataFnHover } from "./datafunction";
import { guiDefSources, type GuiPaths } from "./guiNavigation";
import {
  collectOverridableBlocks,
  resolveGuiDef,
  typeBaseChain,
  type GuiTypeDef,
} from "../gui/guiDefs";
import { wordRangeAt } from "../wordAt";
import { getLineText } from "../documents";
import { renderCard, renderHover } from "./hoverRender";
import * as path from "path";
import { URI } from "vscode-uri";

interface GuiTypeInfo {
  count: number;
  props: Record<string, number>;
}
interface GuiSchemaShape {
  types: Record<string, GuiTypeInfo>;
  globalProps: Record<string, number>;
}
const GUI: GuiSchemaShape = GUI_SCHEMA_JSON as unknown as GuiSchemaShape;

const TIER_PROP = "0";
const TIER_TYPE = "2";

function rank2(rank: number): string {
  return String(Math.min(99, rank)).padStart(2, "0");
}

const VALUE_POSITION = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([A-Za-z0-9_.\-]*)$/;
const WORD_AT_END = /[A-Za-z0-9_][A-Za-z0-9_.\-]*$/;

/** Innermost enclosing widget-block key at the offset, lowercased. */
function enclosingType(document: TextDocument, offset: number): string | null {
  const { result } = getParse(document);
  const named = blockStackFromParse(result, offset).filter((s) => s !== "<anon>");
  return named.length > 0 ? named[named.length - 1].toLowerCase() : null;
}

export function provideGuiCompletion(
  data: ServerData,
  document: TextDocument,
  offset: number
): CompletionResult {
  const { lineIndex } = getParse(document);
  const pos = lineIndex.positionAt(offset);
  const linePrefix = document.getText({
    start: { line: pos.line, character: 0 },
    end: { line: pos.line, character: pos.character },
  });

  // Inside a [ ... ] datafunction expression → data types / promotes / functions.
  const dataFn = provideDataFnCompletion(data.dataTypes, data.dataFnUsage, linePrefix);
  if (dataFn !== null) return dataFn;

  // `using = |` → templates (mod first, then vanilla).
  const valueMatch = VALUE_POSITION.exec(linePrefix);
  if (valueMatch) {
    const key = valueMatch[1].toLowerCase();
    if (key === "using" || key === "template") {
      const items: CompletionItem[] = [];
      for (const d of data.index.entries((def) => def.kind === "gui_type")) {
        items.push({
          label: d.name,
          kind: CompletionItemKind.Class,
          detail: `gui template/type (${d.source})`,
          sortText: TIER_PROP + (d.source === "mod" ? "0" : "1") + d.name,
          data: { t: "def", k: "gui_type", n: d.name },
        });
      }
      return finalize(items, valueMatch[2], MAX_ITEMS);
    }
    // Literal values (numbers, "[data functions]", texture paths): nothing to offer.
    return { isIncomplete: false, items: [] };
  }

  const typedWord = WORD_AT_END.exec(linePrefix)?.[0] ?? "";
  const enclosing = enclosingType(document, offset);
  const items: CompletionItem[] = [];
  const seen = new Set<string>();

  // Properties/children of the enclosing widget type (global stats when the
  // type is mod-defined and unknown to the vanilla harvest).
  const typeInfo = enclosing ? GUI.types[enclosing] : null;
  const props = typeInfo?.props ?? (enclosing ? GUI.globalProps : {});
  const ranked = Object.entries(props).sort((a, b) => b[1] - a[1]);
  ranked.forEach(([key, count], i) => {
    seen.add(key);
    const alsoType = key in GUI.types;
    items.push({
      label: key,
      kind: alsoType ? CompletionItemKind.Class : CompletionItemKind.Property,
      detail: typeInfo
        ? `${alsoType ? "child widget" : "property"} of ${enclosing} · ${count}× in vanilla`
        : `gui ${alsoType ? "widget" : "property"} · ${count}× in vanilla`,
      sortText: TIER_PROP + rank2(i) + key,
    });
  });

  // Remaining widget types (and everything at top level).
  const types = Object.entries(GUI.types).sort((a, b) => b[1].count - a[1].count);
  types.forEach(([name, info], i) => {
    if (seen.has(name)) return;
    items.push({
      label: name,
      kind: CompletionItemKind.Class,
      detail: `widget type · ${info.count}× in vanilla`,
      sortText: TIER_TYPE + rank2(Math.min(99, i)) + name,
    });
  });

  return finalize(items, typedWord, MAX_ITEMS);
}

/** Cap for the overridable-blocks list in a template/type hover card. */
const MAX_BLOCKS_SHOWN = 24;

export function provideGuiHover(
  data: ServerData,
  document: TextDocument,
  position: Position,
  paths?: GuiPaths
): Hover | null {
  const lineText = getLineText(document, position.line);

  // A chain segment inside [ ... ] → datafunction card (own range: word
  // boundaries differ, dots split segments).
  const dataFn = provideDataFnHover(data.dataTypes, data.dataFnUsage, lineText, position.character, paths?.gamePath ?? null);
  if (dataFn) {
    return {
      contents: { kind: MarkupKind.Markdown, value: dataFn.markdown },
      range: {
        start: { line: position.line, character: dataFn.start },
        end: { line: position.line, character: dataFn.end },
      },
    };
  }

  const range = wordRangeAt(lineText, position.character);
  if (!range) return null;
  const word = range.word;
  const lower = word.toLowerCase();
  const { lineIndex } = getParse(document);
  const offset = lineIndex.offsetAt(position);

  const cards: string[] = [];

  const typeInfo = GUI.types[lower];
  if (typeInfo) {
    const top = Object.entries(typeInfo.props)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => `\`${k}\``)
      .join(" ");
    cards.push(
      renderCard({
        kind: "gui_type",
        badgeLabel: "widget type",
        name: lower,
        headTail: `· ${typeInfo.count}× in vanilla gui`,
        doc: top ? `Common properties: ${top}` : undefined,
      })
    );
  }

  const enclosing = enclosingType(document, offset);
  const encInfo = enclosing ? GUI.types[enclosing] : null;
  const propCount = encInfo?.props[lower] ?? GUI.globalProps[lower];
  if (!typeInfo && propCount) {
    cards.push(
      renderCard({
        kind: "gui_property",
        badgeLabel: "gui property",
        name: lower,
        headTail: encInfo ? `on ${enclosing}` : undefined,
        doc: `${propCount.toLocaleString("en-US")} uses in the vanilla gui tree.`,
      })
    );
  }

  // Template/type card from the cross-file store: base chain, overridable
  // blocks (what a blockoverride can target), definition link.
  let resolvedCard = false;
  if (paths) {
    const sources = guiDefSources(document, paths);
    const resolved = resolveGuiDef(word, sources);
    if (resolved) {
      resolvedCard = true;
      const docParts: string[] = [];
      if (resolved.kind === "type") {
        const chain = typeBaseChain(resolved.name, sources);
        if (chain.length > 0) docParts.push(`Extends: \`${chain.join("` → `")}\``);
      }
      const blocks = [...collectOverridableBlocks(resolved, sources).keys()].sort();
      if (blocks.length > 0) {
        const shown = blocks.slice(0, MAX_BLOCKS_SHOWN).map((b) => `\`${b}\``);
        if (blocks.length > MAX_BLOCKS_SHOWN) shown.push(`… +${blocks.length - MAX_BLOCKS_SHOWN} more`);
        docParts.push(`Overridable blocks: ${shown.join(" ")}`);
      }
      const def = resolved.def;
      const footer: string[] = [];
      if (def.file !== undefined && def.line !== undefined) {
        footer.push(
          `[${path.basename(def.file)}:${def.line + 1}](${URI.file(def.file).with({ fragment: String(def.line + 1) }).toString()})`
        );
      }
      cards.push(
        renderCard({
          kind: "gui_type",
          badgeLabel: resolved.kind,
          name: resolved.kind === "template" ? word : resolved.name,
          headTail: resolved.kind === "type" ? `= ${(def as GuiTypeDef).base}` : undefined,
          doc: docParts.length > 0 ? docParts.join("\n\n") : undefined,
          footer: footer.length > 0 ? footer : undefined,
        })
      );
    }
  }

  // Index-based fallback card (kept for gui_type defs the store cannot see).
  if (!resolvedCard) {
    for (const def of data.index.lookup(word)) {
      if (def.kind !== "gui_type") continue;
      const link = `[${path.basename(def.file)}:${def.line + 1}](${URI.file(def.file).with({ fragment: String(def.line + 1) }).toString()})`;
      cards.push(
        renderCard({
          kind: "gui_type",
          badgeLabel: "template / type",
          name: def.name,
          headTail: `· ${def.source}`,
          footer: [link],
        })
      );
    }
  }

  if (cards.length === 0) return null;
  return {
    contents: { kind: MarkupKind.Markdown, value: renderHover(cards, null) },
    range: {
      start: { line: position.line, character: range.start },
      end: { line: position.line, character: range.end },
    },
  };
}
