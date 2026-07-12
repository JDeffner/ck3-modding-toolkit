/**
 * Completion, hover and signature help for [ ... ] data-function expressions
 * in .gui and localization files. Three knowledge layers, best-first:
 *
 *  - the user's DumpDataTypes output (version-exact names, args, returns);
 *  - the bundled wiki baseline (shared/data/dataTypes.json);
 *  - vanilla usage harvested from the user's own game files (dataFnUsage.ts):
 *    names newer than both tables, usage counts for ranking, observed literal
 *    arguments, formatting suffixes, and real example sites.
 *
 * AD-5 applies: unknown names never produce diagnostics; unresolved chains
 * fall back to the vanilla member pool instead of going silent.
 */
import { CompletionItemKind, type CompletionItem, type SignatureHelp } from "vscode-languageserver/node";
import { describeDataFn } from "../data/dataFnDocs";
import { membersOf, resolveChainType, type DataTypeMember, type DataTypesData } from "../data/dataTypes";
import type { DataFnUsage } from "../data/dataFnUsage";
import { finalize, MAX_ITEMS, type CompletionResult } from "./completion";
import { URI } from "vscode-uri";
import * as path from "path";

/**
 * The expression text when `linePrefix` ends inside an unclosed [ ... ], else
 * null. Datafunction expressions never span lines, so the line prefix is
 * enough context.
 */
export function datafunctionExprAt(linePrefix: string): string | null {
  let open = -1;
  for (let i = 0; i < linePrefix.length; i++) {
    const ch = linePrefix[i];
    if (ch === "[") open = i;
    else if (ch === "]") open = -1;
  }
  return open >= 0 ? linePrefix.slice(open + 1) : null;
}

/**
 * The dotted chain being typed at the end of an expression: for
 * `Concat( 'x', Character.GetFather.` → ["Character","GetFather",""].
 * The last element is the (possibly empty) segment under the cursor.
 */
export function chainAtEnd(expr: string): string[] {
  // Cut at the last argument/string/formatting boundary; dots stay.
  let start = 0;
  for (let i = expr.length - 1; i >= 0; i--) {
    if ("('\", |".includes(expr[i]) || expr[i] === ")") {
      start = i + 1;
      break;
    }
  }
  const tail = expr.slice(start).trim();
  if (tail.length === 0) return [""];
  if (!/^[A-Za-z0-9_.]*$/.test(tail)) return [""];
  return tail.split(".");
}

/** The innermost function call still open at the end of `expr`, if any. */
export interface OpenCall {
  /** Dotted chain of the called name, e.g. ["Character","GetHouseAspiration"]. */
  chain: string[];
  /** 0-based index of the argument the cursor is in. */
  argIndex: number;
  /** Text typed inside an unclosed '...' literal, or null when not in one. */
  literalPrefix: string | null;
}

export function openCallAt(expr: string): OpenCall | null {
  interface Frame {
    chain: string[];
    argIndex: number;
  }
  const stack: Frame[] = [];
  let chain: string[] = [];
  let word = "";
  const flushWord = () => {
    if (word.length > 0) {
      chain.push(word);
      word = "";
    }
  };
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/[A-Za-z0-9_]/.test(ch)) {
      word += ch;
      i++;
    } else if (ch === ".") {
      flushWord();
      i++;
    } else if (ch === "(") {
      flushWord();
      stack.push({ chain, argIndex: 0 });
      chain = [];
      i++;
    } else if (ch === ")") {
      stack.pop();
      chain = [];
      word = "";
      i++;
    } else if (ch === ",") {
      if (stack.length > 0) stack[stack.length - 1].argIndex++;
      chain = [];
      word = "";
      i++;
    } else if (ch === "'") {
      const close = expr.indexOf("'", i + 1);
      if (close < 0) {
        const top = stack[stack.length - 1];
        if (!top || top.chain.length === 0) return null;
        return { chain: top.chain, argIndex: top.argIndex, literalPrefix: expr.slice(i + 1) };
      }
      i = close + 1;
    } else if (ch === " " || ch === "\t") {
      flushWord();
      i++;
    } else {
      flushWord();
      chain = [];
      i++;
    }
  }
  const top = stack[stack.length - 1];
  if (!top || top.chain.length === 0) return null;
  return { chain: top.chain, argIndex: top.argIndex, literalPrefix: null };
}

// ---- ranking / rendering helpers ----------------------------------------------

/** Log-bucketed frequency rank: higher vanilla usage sorts first. */
function freq3(count: number): string {
  return String(999 - Math.min(998, Math.round(Math.log2(1 + count) * 55))).padStart(3, "0");
}

function memberDetail(member: DataTypeMember, owner?: string): string {
  const args = member.args && member.args.length > 0 ? `( ${member.args.join(", ")} )` : "";
  const ret = member.ret ? ` → ${member.ret}` : "";
  return `${owner ? owner + " " : ""}${member.kind}${args}${ret}`;
}

function usesSuffix(count: number): string {
  return count > 0 ? ` · ${count.toLocaleString("en-US")}× in vanilla` : "";
}

const SOURCE_LABEL: Record<string, string> = {
  dump: "your DumpDataTypes log",
  wiki: "bundled wiki tables",
};

/** Total vanilla-usage count of a name in any role. */
function usageCount(usage: DataFnUsage, name: string): number {
  return (usage.starts.get(name) ?? 0) + (usage.memberPool.get(name) ?? 0);
}

/** Member rank: type-specific pairs weigh more than the global pool. */
function memberRank(usage: DataFnUsage, owner: string | null, name: string): number {
  const pair = owner ? usage.pairs.get(owner)?.get(name) ?? 0 : 0;
  return pair * 3 + (usage.memberPool.get(name) ?? 0);
}

// ---- completion ----------------------------------------------------------------

/**
 * Completion inside a [ ... ] expression, or null when the cursor is not in
 * one (caller falls through to its normal provider).
 */
export function provideDataFnCompletion(
  data: DataTypesData,
  usage: DataFnUsage,
  linePrefix: string
): CompletionResult | null {
  const expr = datafunctionExprAt(linePrefix);
  if (expr === null) return null;

  // Inside a '...' literal argument: observed literal values for that function.
  const call = openCallAt(expr);
  if (call && call.literalPrefix !== null) {
    const fn = call.chain[call.chain.length - 1];
    const lits = usage.literals.get(fn);
    if (!lits) return { isIncomplete: false, items: [] };
    const items: CompletionItem[] = [...lits.entries()].map(([value, count]) => ({
      label: value,
      kind: CompletionItemKind.Value,
      detail: `argument of ${fn}${usesSuffix(count)}`,
      sortText: freq3(count) + value,
      data: { t: "dfn" },
    }));
    return finalize(items, call.literalPrefix, MAX_ITEMS);
  }

  // After `|`: formatting suffixes observed in vanilla ( |E, |U, |V0, … ).
  const fmt = /\|([A-Za-z0-9+\-=*%.]*)$/.exec(expr);
  if (fmt) {
    const items: CompletionItem[] = [...usage.formats.entries()]
      .filter(([, count]) => count >= 3)
      .map(([suffix, count]) => ({
        label: suffix,
        kind: CompletionItemKind.EnumMember,
        detail: `format suffix${usesSuffix(count)}`,
        sortText: freq3(count) + suffix,
        data: { t: "dfn" },
      }));
    return finalize(items, fmt[1], MAX_ITEMS);
  }

  const chain = chainAtEnd(expr);
  const typed = chain[chain.length - 1];
  const items: CompletionItem[] = [];

  if (chain.length === 1) {
    // Chain start: data types, global promotes/functions, and names vanilla
    // uses that neither table knows yet. Ranked by vanilla frequency.
    const seen = new Set<string>();
    for (const type of data.types.keys()) {
      seen.add(type);
      const count = usage.starts.get(type) ?? 0;
      items.push({
        label: type,
        kind: CompletionItemKind.Class,
        detail: `data type${usesSuffix(count)}`,
        sortText: freq3(count) + type,
        data: { t: "dfn" },
      });
    }
    for (const [name, member] of data.globals) {
      if (seen.has(name)) continue;
      seen.add(name);
      const count = usage.starts.get(name) ?? 0;
      const doc = describeDataFn(name, member);
      items.push({
        label: name,
        kind: member.kind === "promote" ? CompletionItemKind.Variable : CompletionItemKind.Function,
        detail: `global ${memberDetail(member)}${usesSuffix(count)}`,
        ...(doc ? { documentation: doc } : {}),
        sortText: freq3(count) + name,
        data: { t: "dfn" },
      });
    }
    for (const [name, count] of usage.starts) {
      if (seen.has(name)) continue;
      const called = usage.argCounts.has(name);
      const hasMembers = usage.pairs.has(name);
      const doc = describeDataFn(name, null);
      items.push({
        label: name,
        kind: hasMembers && !called ? CompletionItemKind.Class : CompletionItemKind.Function,
        detail: `vanilla usage${usesSuffix(count)} (not in the data-type tables)`,
        ...(doc ? { documentation: doc } : {}),
        sortText: freq3(count) + name,
        data: { t: "dfn" },
      });
    }
    return finalize(items, typed, MAX_ITEMS);
  }

  // Member position: resolve the chain to a type when the tables allow it.
  const ownerSegments = chain.slice(0, -1);
  const ownerType = resolveChainType(data, ownerSegments);
  const pairOwner = ownerSegments.length === 1 ? ownerSegments[0] : null;
  if (ownerType) {
    const members = membersOf(data, ownerType) ?? new Map<string, DataTypeMember>();
    const seen = new Set<string>();
    for (const [name, member] of members) {
      seen.add(name);
      const doc = member.desc ?? describeDataFn(name, member) ?? undefined;
      items.push({
        label: name,
        kind: member.kind === "promote" ? CompletionItemKind.Property : CompletionItemKind.Method,
        detail: memberDetail(member, ownerType + ".") + usesSuffix(memberRank(usage, ownerType, name)),
        ...(doc ? { documentation: doc } : {}),
        sortText: freq3(memberRank(usage, ownerType, name)) + name,
        data: { t: "dfn" },
      });
    }
    // Members vanilla chains off this same start but the tables don't list.
    const harvested = usage.pairs.get(ownerType) ?? (pairOwner ? usage.pairs.get(pairOwner) : undefined);
    for (const [name, count] of harvested ?? []) {
      if (seen.has(name)) continue;
      const doc = describeDataFn(name, null);
      items.push({
        label: name,
        kind: CompletionItemKind.Method,
        detail: `vanilla usage on ${pairOwner ?? ownerType}${usesSuffix(count)}`,
        ...(doc ? { documentation: doc } : {}),
        sortText: freq3(count) + name,
        data: { t: "dfn" },
      });
    }
    return finalize(items, typed, MAX_ITEMS);
  }

  // Chain the tables cannot resolve (unknown start, missing return type…):
  // offer the vanilla member pool rather than nothing — AD-5, annotate not hide.
  const harvestedPairs = pairOwner ? usage.pairs.get(pairOwner) : undefined;
  if (harvestedPairs && harvestedPairs.size > 0) {
    for (const [name, count] of harvestedPairs) {
      const doc = describeDataFn(name, null);
      items.push({
        label: name,
        kind: CompletionItemKind.Method,
        detail: `vanilla usage on ${pairOwner}${usesSuffix(count)}`,
        ...(doc ? { documentation: doc } : {}),
        sortText: freq3(count) + name,
        data: { t: "dfn" },
      });
    }
    return finalize(items, typed, MAX_ITEMS);
  }
  for (const [name, count] of usage.memberPool) {
    items.push({
      label: name,
      kind: CompletionItemKind.Method,
      detail: `vanilla usage${usesSuffix(count)} (chain not resolved)`,
      sortText: freq3(count) + name,
      data: { t: "dfn" },
    });
  }
  return finalize(items, typed, MAX_ITEMS);
}

// ---- hover ----------------------------------------------------------------------

export interface DataFnHoverInfo {
  markdown: string;
  start: number;
  end: number;
}

function exampleLines(usage: DataFnUsage, name: string, gameRoot: string | null): string[] {
  const examples = usage.examples.get(name);
  if (!examples || examples.length === 0) return [];
  const lines = ["", "Vanilla examples:"];
  for (const ex of examples) {
    const site = `${ex.file}:${ex.line}`;
    const link = gameRoot
      ? `[${site}](${URI.file(path.join(gameRoot, ex.file)).with({ fragment: String(ex.line) }).toString()})`
      : site;
    lines.push(`- \`${ex.text}\` — ${link}`);
  }
  return lines;
}

function literalLines(usage: DataFnUsage, name: string): string[] {
  const lits = usage.literals.get(name);
  if (!lits || lits.size === 0) return [];
  const top = [...lits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([v]) => `\`'${v}'\``);
  return ["", `Observed arguments: ${top.join(", ")}${lits.size > 8 ? ", …" : ""}`];
}

function provenance(member: DataTypeMember | null): string {
  if (member?.src && SOURCE_LABEL[member.src]) return SOURCE_LABEL[member.src];
  return "deduced from vanilla usage";
}

/** Top-8 `.member` names observed after `name` in vanilla, as one hover line. */
function topMemberLines(usage: DataFnUsage, name: string, label: string): string[] {
  const pairs = usage.pairs.get(name);
  if (!pairs || pairs.size === 0) return [];
  const top = [...pairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([n]) => `\`${n}\``);
  return ["", `${label}: ${top.join(" ")}`];
}

const DUMP_HINT = "*Run `DumpDataTypes` in the game console for the version-exact definition.*";

/** Shared hover tail: description, observed literals, vanilla example sites. */
function usageDetailLines(
  usage: DataFnUsage,
  name: string,
  desc: string | null | undefined,
  gameRoot: string | null,
  dumpHint = false
): string[] {
  const lines: string[] = [];
  if (desc) lines.push("", desc);
  lines.push(...literalLines(usage, name));
  lines.push(...exampleLines(usage, name, gameRoot));
  if (dumpHint) lines.push("", DUMP_HINT);
  return lines;
}

/**
 * Hover info for the chain segment at `character` when it sits inside a
 * [ ... ] expression and is known to any layer; null lets the caller fall
 * through to its normal hover.
 */
export function provideDataFnHover(
  data: DataTypesData,
  usage: DataFnUsage,
  lineText: string,
  character: number,
  gameRoot: string | null = null
): DataFnHoverInfo | null {
  // Inside an expression? The [ must be open where the cursor sits.
  const prefix = lineText.slice(0, character);
  if (datafunctionExprAt(prefix) === null && lineText[character] !== "[") return null;

  // The dotted chain around the cursor.
  const isWord = (ch: string) => /[A-Za-z0-9_.]/.test(ch);
  let start = character;
  while (start > 0 && isWord(lineText[start - 1])) start--;
  let end = character;
  while (end < lineText.length && isWord(lineText[end])) end++;
  const dotted = lineText.slice(start, end);
  if (!/^[A-Za-z0-9_.]+$/.test(dotted)) return null;

  // Which segment is under the cursor?
  const segments = dotted.split(".");
  let segStart = start;
  let index = 0;
  for (; index < segments.length; index++) {
    const segEnd = segStart + segments[index].length;
    if (character <= segEnd) break;
    segStart = segEnd + 1; // skip the dot
  }
  if (index >= segments.length) return null;
  const segment = segments[index];
  if (segment.length === 0) return null;

  const lines: string[] = [];
  const uses = usageCount(usage, segment);

  if (index === 0) {
    const typeMembers = membersOf(data, segment);
    if (typeMembers) {
      lines.push(`\`${segment}\` — data type (${typeMembers.size} known members)`);
      if (uses > 0) lines.push("", `Used ${uses.toLocaleString("en-US")}× in vanilla gui/localization.`);
      lines.push(...topMemberLines(usage, segment, "Most-used members"));
      lines.push(...exampleLines(usage, segment, gameRoot));
    } else {
      const global = data.globals.get(segment);
      if (global) {
        lines.push(`\`${segment}${global.args?.length ? `( ${global.args.join(", ")} )` : ""}\`${global.ret ? ` → \`${global.ret}\`` : ""}`);
        lines.push("", `global ${global.kind} — ${provenance(global)}${usesSuffix(uses)}`);
        lines.push(...usageDetailLines(usage, segment, global.desc ?? describeDataFn(segment, global), gameRoot));
      } else if (uses > 0) {
        lines.push(`\`${segment}\``);
        lines.push("", `not in the data-type tables — ${provenance(null)}${usesSuffix(uses)}`);
        const desc = describeDataFn(segment, null);
        if (desc) lines.push("", desc);
        lines.push(...topMemberLines(usage, segment, "Members seen after it"));
        lines.push(...literalLines(usage, segment));
        lines.push(...exampleLines(usage, segment, gameRoot));
        lines.push("", DUMP_HINT);
      } else {
        return null;
      }
    }
  } else {
    const ownerType = resolveChainType(data, segments.slice(0, index));
    const member = ownerType ? membersOf(data, ownerType)?.get(segment) : undefined;
    if (member && ownerType) {
      lines.push(
        `\`${ownerType}.${segment}${member.args?.length ? `( ${member.args.join(", ")} )` : ""}\`${member.ret ? ` → \`${member.ret}\`` : ""}`
      );
      lines.push("", `${member.kind} on \`${ownerType}\` — ${provenance(member)}${usesSuffix(uses)}`);
      lines.push(...usageDetailLines(usage, segment, member.desc ?? describeDataFn(segment, member), gameRoot));
    } else if (uses > 0) {
      lines.push(`\`${segment}\``);
      lines.push("", `member — ${provenance(null)}${usesSuffix(uses)}`);
      lines.push(...usageDetailLines(usage, segment, describeDataFn(segment, null), gameRoot, /*dumpHint*/ true));
    } else {
      return null;
    }
  }
  return { markdown: lines.join("\n"), start: segStart, end: segStart + segment.length };
}

// ---- signature help ----------------------------------------------------------------

/**
 * Signature help for the innermost open call in a [ ... ] expression:
 * `ObjectsEqual( a, | )` shows the argument list with the active one
 * highlighted. Argument types come from the dump when known, else the
 * most-observed vanilla arity.
 */
export function provideDataFnSignature(
  data: DataTypesData,
  usage: DataFnUsage,
  lineText: string,
  character: number
): SignatureHelp | null {
  const prefix = lineText.slice(0, character);
  const expr = datafunctionExprAt(prefix);
  if (expr === null) return null;
  const call = openCallAt(expr);
  if (!call) return null;

  const fn = call.chain[call.chain.length - 1];
  let member: DataTypeMember | undefined;
  let owner: string | null = null;
  if (call.chain.length > 1) {
    owner = resolveChainType(data, call.chain.slice(0, -1));
    if (owner) member = membersOf(data, owner)?.get(fn);
  } else {
    member = data.globals.get(fn);
  }
  if (!member) {
    // Any type carrying this member (dump data makes this near-unique).
    for (const [typeName, members] of data.types) {
      const m = members.get(fn);
      if (m?.args && m.args.length > 0) {
        member = m;
        owner = typeName;
        break;
      }
    }
  }

  let argNames: string[];
  if (member?.args && member.args.length > 0) {
    argNames = member.args;
  } else {
    const arities = usage.argCounts.get(fn);
    if (!arities || arities.size === 0) return null;
    let best = 0;
    let bestCount = -1;
    for (const [arity, count] of arities) {
      if (count > bestCount) {
        best = arity;
        bestCount = count;
      }
    }
    if (best === 0) return null;
    argNames = Array.from({ length: best }, (_, i) => `arg${i + 1}`);
  }

  // Build the label with per-parameter offsets so duplicate type names
  // (CString, CString) still highlight the right one.
  let label = `${fn}( `;
  const params: Array<{ label: [number, number]; documentation?: string }> = [];
  argNames.forEach((arg, i) => {
    if (i > 0) label += ", ";
    const from = label.length;
    label += arg;
    params.push({ label: [from, label.length] });
  });
  label += " )";
  if (member?.ret) label += ` → ${member.ret}`;

  const docParts: string[] = [];
  const desc = member?.desc ?? describeDataFn(fn, member ?? null);
  if (desc) docParts.push(desc);
  const lits = usage.literals.get(fn);
  if (lits && lits.size > 0) {
    const top = [...lits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([v]) => `'${v}'`);
    docParts.push(`Observed arguments: ${top.join(", ")}${lits.size > 6 ? ", …" : ""}`);
  }
  if (member === undefined) docParts.push(`Arity observed in vanilla usage (${usage.argCounts.get(fn)?.get(argNames.length) ?? 0} sites).`);

  return {
    signatures: [
      {
        label,
        ...(docParts.length > 0 ? { documentation: docParts.join("\n\n") } : {}),
        parameters: params,
      },
    ],
    activeSignature: 0,
    activeParameter: Math.min(call.argIndex, argNames.length - 1),
  };
}
