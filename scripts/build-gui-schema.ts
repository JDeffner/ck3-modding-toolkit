/**
 * Build-time harvest of the PdxGui vocabulary from the vanilla gui/ tree:
 * which keys are used as widget/container blocks, and which properties each
 * carries (with usage counts for ranking). `type X = base { }` declarations
 * fold their property stats into the base type, so derived types enrich the
 * base vocabulary. Output: shared/data/guiSchema.json (bundled).
 *
 * Run:
 *   npx esbuild scripts/build-gui-schema.ts --bundle --platform=node \
 *     --outfile=dist/build-gui-schema.cjs && node dist/build-gui-schema.cjs [gamePath]
 */
import * as fs from "fs";
import * as path from "path";
import { decode, parseScript, type BlockNode, type Statement } from "../server/src/parser";
import { requireDevPath } from "../test/devPaths";

const gamePath = process.argv[2] ?? requireDevPath("gamePath", "build-gui-schema");

const NAME_OK = /^[a-z][a-z0-9_]*$/;
const MAX_PROPS_PER_TYPE = 100;
const MIN_TYPE_COUNT = 2;
const MIN_PROP_COUNT = 2;

/** Attribute blocks (`size = { 100% 100% }`) — data, never widget types. */
const ATTRIBUTE_BLOCKS = new Set([
  "size", "position", "framesize", "spriteborder", "color", "disabledcolor", "uv_scale",
  "margin", "padding", "mipmaplodbias", "modify_texture", "resizeparent", "cursor_properties",
  "min_width", "max_width", "spriteborder_top", "spriteborder_bottom",
]);

const typeCount = new Map<string, number>();
const baseOf = new Map<string, string>();
const props = new Map<string, Map<string, number>>();
const globalProps = new Map<string, number>();

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function childBlock(stmt: Statement): BlockNode | null {
  if (stmt.kind !== "assignment") return null;
  const v = stmt.value;
  if (!v) return null;
  if (v.kind === "block") return v;
  if (v.kind === "tagged-block") return v.block;
  return null;
}

function recordBlock(typeName: string, block: BlockNode): void {
  // A widget block carries key = value assignments; attribute blocks
  // (`size = { 100% 100% }`) hold bare scalars and are not widget types.
  if (ATTRIBUTE_BLOCKS.has(typeName)) return;
  if (!block.statements.some((s) => s.kind === "assignment")) return;
  bump(typeCount, typeName);
  let bag = props.get(typeName);
  if (!bag) props.set(typeName, (bag = new Map()));
  for (const child of block.statements) {
    if (child.kind !== "assignment" || child.key.quoted) continue;
    const key = child.key.text.toLowerCase();
    if (!NAME_OK.test(key)) continue;
    bump(bag, key);
    bump(globalProps, key);
  }
}

function walk(statements: Statement[]): void {
  let pendingDecl: string | null = null;
  for (const stmt of statements) {
    if (stmt.kind !== "assignment") {
      if (stmt.value.kind === "scalar" && ["type", "template", "types", "block", "blockoverride"].includes(stmt.value.text.toLowerCase())) {
        pendingDecl = stmt.value.text.toLowerCase();
      } else if (stmt.value.kind === "block") {
        walk(stmt.value.statements);
        pendingDecl = null;
      }
      continue;
    }
    const block = childBlock(stmt);
    if (!block) {
      pendingDecl = null;
      continue;
    }
    const key = stmt.key.text.toLowerCase();
    if (pendingDecl === "type" && stmt.value?.kind === "tagged-block") {
      // type X = base { ... }: stats fold into the BASE type.
      const base = stmt.value.tag.text.toLowerCase();
      if (NAME_OK.test(base)) {
        baseOf.set(key, base);
        recordBlock(base, block);
      }
    } else if (pendingDecl === null && NAME_OK.test(key)) {
      // Regular child widget: resolve derived types to their base for stats.
      recordBlock(baseOf.get(key) ?? key, block);
    }
    walk(block.statements);
    pendingDecl = null;
  }
}

const files: string[] = [];
const collect = (dir: string) => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collect(full);
    else if (e.name.endsWith(".gui")) files.push(full);
  }
};
collect(path.join(gamePath, "gui"));

for (const file of files) {
  try {
    walk(parseScript(decode(fs.readFileSync(file)).text).root.statements);
  } catch {
    /* tolerant: skip unreadable file */
  }
}

const types: Record<string, { count: number; props: Record<string, number> }> = {};
for (const [name, count] of [...typeCount.entries()].sort((a, b) => b[1] - a[1])) {
  if (count < MIN_TYPE_COUNT) continue;
  const bag = props.get(name) ?? new Map();
  const kept = [...bag.entries()]
    .filter(([, n]) => n >= MIN_PROP_COUNT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PROPS_PER_TYPE);
  types[name] = { count, props: Object.fromEntries(kept) };
}
const global = Object.fromEntries(
  [...globalProps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200)
);

const out = {
  meta: { generated: new Date().toISOString().slice(0, 10), files: files.length },
  types,
  globalProps: global,
};
const target = path.join(__dirname, "..", "shared", "data", "guiSchema.json");
fs.writeFileSync(target, JSON.stringify(out, null, 1), "utf8");
console.log(`wrote ${target}: ${Object.keys(types).length} widget types from ${files.length} files`);
