/**
 * Recursive file listing shared by the server indexer and client-side
 * reference scans. No `vscode` imports.
 */
import * as fs from "fs";
import * as path from "path";

/** All files under `dir` (recursive) with the given extension (lowercase match). */
export function listFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  walkDir(dir, ext, out);
  return out;
}

export function walkDir(dir: string, ext: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    // Dot-directories (.git, .claude worktrees, …) are never game content and
    // can hold stale copies of the whole mod — indexing them pollutes results.
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, ext, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) out.push(full);
  }
}
