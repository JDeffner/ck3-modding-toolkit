/**
 * Find-all-references over the reference index (mod usage sites), optionally
 * including the definition sites.
 */
import type { Location, Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import type { ServerData } from "../serverData";
import { wordRangeAt } from "../wordAt";
import { getLineText } from "../documents";

export function provideReferences(
  data: ServerData,
  document: TextDocument,
  position: Position,
  includeDeclaration: boolean
): Location[] {
  const range = wordRangeAt(getLineText(document, position.line), position.character);
  if (!range) return [];
  const name = stripPrefix(range.word);

  const locations: Location[] = data.refIndex.lookup(name).map((r) => ({
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
