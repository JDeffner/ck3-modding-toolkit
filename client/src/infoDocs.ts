/**
 * `CK3: Open Format Docs (.info) for This File` — the game ships ~150 `_*.info` files inside
 * common/ documenting each folder's format (Paradox's own schema docs). This
 * command surfaces the one for the active file's folder, resolved against the
 * vanilla tree, so the ground truth is one keystroke away.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { Ck3Config } from "./config";

function infoFilesIn(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".info"))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function openInfoDocsCommand(cfg: Ck3Config): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("CK3: open a mod script file first.");
    return;
  }
  if (!cfg.gamePath) {
    void vscode.window.showWarningMessage("CK3: set ck3.gamePath to use the game's .info format docs.");
    return;
  }
  const file = editor.document.uri.fsPath;
  const root = [cfg.modPath, ...cfg.parentPaths, cfg.gamePath].find(
    (r) => r && file.toLowerCase().startsWith(r.toLowerCase() + path.sep)
  );
  if (!root) {
    void vscode.window.showWarningMessage("CK3: this file is outside the mod and game folders.");
    return;
  }

  // Walk the relative folder chain upward, looking for .info files in vanilla.
  let relDir = path.dirname(path.relative(root, file));
  const candidates: string[] = [];
  while (relDir !== "." && relDir !== "") {
    candidates.push(...infoFilesIn(path.join(cfg.gamePath, relDir)));
    const parent = path.dirname(relDir);
    if (parent === relDir) break;
    relDir = parent;
  }
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage("CK3: no .info format docs found for this folder in the game files.");
    return;
  }

  let chosen = candidates[0];
  if (candidates.length > 1) {
    const pick = await vscode.window.showQuickPick(
      candidates.map((c) => ({ label: path.basename(c), description: path.relative(cfg.gamePath!, c), c })),
      { title: "Format docs (.info)" }
    );
    if (!pick) return;
    chosen = pick.c;
  }
  const doc = await vscode.workspace.openTextDocument(chosen);
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
}
