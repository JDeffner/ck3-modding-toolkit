/**
 * Status bar item summarizing the extension's data health at a glance:
 * engine tokens, index size, tiger availability. Click runs CK3: Run Setup
 * & Health Check.
 */
import * as vscode from "vscode";

export interface Ck3Status {
  tokens: number;
  indexing: boolean;
  tokensFromScriptDocs: boolean;
  definitions: number;
  gameOk: boolean;
  modOk: boolean;
  tigerOk: boolean;
}

export class Ck3StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.item.name = "CK3 Modding Toolkit";
    this.item.command = "ck3.setup";
    this.item.text = "$(loading~spin) CK3";
    this.item.show();
  }

  update(s: Ck3Status): void {
    const healthy = s.gameOk && s.modOk && s.tigerOk && s.tokens > 0;
    this.item.text = s.indexing ? "$(loading~spin) CK3" : healthy ? "$(check) CK3" : "$(warning) CK3";
    const lines = [
      `**CK3 Modding Toolkit** — click to run setup & health check`,
      "",
      `${s.tokens > 0 ? "✓" : "✗"} engine tokens: ${s.tokens}${s.tokens > 0 ? (s.tokensFromScriptDocs ? " (script_docs + wiki)" : " (bundled wiki only)") : ""}`,
      `${s.definitions > 0 ? "✓" : "✗"} indexed definitions: ${s.definitions}`,
      `${s.gameOk ? "✓" : "✗"} game path ${s.gameOk ? "configured" : "missing"}`,
      `${s.modOk ? "✓" : "✗"} mod folder ${s.modOk ? "found" : "missing"}`,
      `${s.tigerOk ? "✓" : "✗"} ck3-tiger ${s.tigerOk ? "available" : "not set up"}`,
    ];
    const md = new vscode.MarkdownString(lines.join("\n\n"));
    this.item.tooltip = md;
  }

  dispose(): void {
    this.item.dispose();
  }
}
