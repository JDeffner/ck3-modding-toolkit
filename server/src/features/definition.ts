/**
 * Go-to-definition for script identifiers: mod definitions shadow vanilla;
 * if none match after shadowing, fall back to everything known.
 */
import type { Location, Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import type { ServerData } from "../serverData";
import { wordRangeAt } from "../wordAt";
import { getLineText } from "../documents";

export function provideDefinition(data: ServerData, document: TextDocument, position: Position): Location[] {
  const range = wordRangeAt(getLineText(document, position.line), position.character);
  if (!range) return [];
  let defs = data.index.lookup(range.word);
  if (defs.length === 0) defs = data.index.lookupAll(range.word);
  return defs.map((d) => ({
    uri: URI.file(d.file).toString(),
    range: { start: { line: d.line, character: 0 }, end: { line: d.line, character: 0 } },
  }));
}
