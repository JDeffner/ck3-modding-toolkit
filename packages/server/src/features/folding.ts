/**
 * Folding ranges from the CST: every `{}` block spanning multiple lines, plus
 * runs of consecutive comment lines.
 */
import { FoldingRangeKind, type FoldingRange } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { walkStatements, type BlockNode, type Statement } from "../parser";
import { getParse } from "../parseCache";

function blockOf(stmt: Statement): BlockNode | null {
  const v = stmt.value;
  if (!v) return null;
  if (v.kind === "block") return v;
  if (v.kind === "tagged-block") return v.block;
  return null;
}

export function provideFoldingRanges(document: TextDocument): FoldingRange[] {
  if (document.languageId !== "paradox") return [];
  const { result, lineIndex } = getParse(document);
  const ranges: FoldingRange[] = [];

  walkStatements(result.root, (stmt) => {
    const block = blockOf(stmt);
    if (!block) return;
    const startLine = lineIndex.positionAt(block.openBrace).line;
    const closeOffset = block.closeBrace ?? block.range.end;
    // Keep the closing brace visible when folded.
    const endLine = lineIndex.positionAt(closeOffset).line - 1;
    if (endLine > startLine) ranges.push({ startLine, endLine });
  });

  // Comment banners: 2+ consecutive full-line comments fold as one region.
  let runStart = -1;
  let prevLine = -2;
  const flush = (lastLine: number) => {
    if (runStart >= 0 && lastLine > runStart) {
      ranges.push({ startLine: runStart, endLine: lastLine, kind: FoldingRangeKind.Comment });
    }
    runStart = -1;
  };
  for (const comment of result.comments) {
    const atLineStart = lineIndex.positionAt(comment.range.start).character === 0;
    if (!atLineStart) continue;
    if (comment.line === prevLine + 1 && runStart >= 0) {
      prevLine = comment.line;
      continue;
    }
    flush(prevLine);
    runStart = comment.line;
    prevLine = comment.line;
  }
  flush(prevLine);

  return ranges;
}
