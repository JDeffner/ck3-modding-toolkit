/**
 * Find-all-references over the reference index (workspace-mod usage sites)
 * merged with the on-demand vanilla/parent scan (#3 — without it, a name used
 * only by vanilla files listed nothing but its definitions), optionally
 * including the definition sites.
 */
import type { Location, Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import type { Reference } from "../../../shared/src/types";
import type { ServerData } from "../serverData";
import { wordRangeAt } from "../wordAt";
import { getLineText } from "../documents";

export async function provideReferences(
  data: ServerData,
  document: TextDocument,
  position: Position,
  includeDeclaration: boolean,
  lazyRefs?: (name: string) => Promise<Reference[]>
): Promise<Location[]> {
  const range = wordRangeAt(getLineText(document, position.line), position.character);
  if (!range) return [];
  const name = stripPrefix(range.word);

  const refs: Reference[] = data.refIndex.lookup(name).slice();
  if (lazyRefs) {
    // The textual scan cannot tell a non-top-level definition site (inline
    // scripted_trigger, nested title) from a use: drop hits the definition
    // index already knows, they are appended under includeDeclaration below.
    const isDefSite = (r: Reference) =>
      data.index.inFile(r.file).some((d) => d.name === name && d.line === r.line);
    refs.push(...(await lazyRefs(name)).filter((r) => !isDefSite(r)));
  }

  const locations: Location[] = refs.map((r) => ({
    uri: URI.file(r.file).toString(),
    range: {
      start: { line: r.line, character: r.startChar },
      end: { line: r.line, character: r.endChar },
    },
  }));

  if (includeDeclaration) {
    for (const d of data.index.lookupAll(name)) {
      locations.push({
        uri: URI.file(d.file).toString(),
        range: { start: { line: d.line, character: 0 }, end: { line: d.line, character: 0 } },
      });
    }
  }
  return locations;
}

/** `scope:x` / `culture:x` under the cursor → the name part. */
export function stripPrefix(word: string): string {
  const colon = word.lastIndexOf(":");
  return colon >= 0 ? word.slice(colon + 1) : word;
}
