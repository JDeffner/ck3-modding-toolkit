import * as vscode from "vscode";
import type { GuiTree } from "../../../../shared/src/protocol";

/** Messages the webview sends to the host. */
type InboundMessage = { type: "open"; line: number } | { type: "refresh" };

/** Messages the host sends to the webview. */
type OutboundMessage =
  | { type: "tree"; tree: GuiTree; file: string }
  | { type: "error"; message: string }
  | { type: "loading" };

/**
 * Singleton GUI widget-tree webview: the .gui file's widget hierarchy as a
 * collapsible tree — type badges, names, template uses — with click-to-jump,
 * filtering, and auto-refresh on save.
 */
export class GuiTreePanel {
  private static instance: GuiTreePanel | undefined;
  private static readonly viewType = "ck3.guiTree";

  private readonly panel: vscode.WebviewPanel;
  private readonly fetchTree: (uri: vscode.Uri, text: string) => Promise<GuiTree>;
  private disposables: vscode.Disposable[] = [];
  private sourceUri: vscode.Uri;
  private disposed = false;

  private constructor(
    fetchTree: (uri: vscode.Uri, text: string) => Promise<GuiTree>,
    source: vscode.TextDocument
  ) {
    this.fetchTree = fetchTree;
    this.sourceUri = source.uri;

    this.panel = vscode.window.createWebviewPanel(
      GuiTreePanel.viewType,
      "CK3 GUI Tree",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
    );
    this.panel.webview.html = buildHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg: InboundMessage) => void this.onMessage(msg),
      undefined,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    // Rebuild on save of the source file.
    vscode.workspace.onDidSaveTextDocument(
      (doc) => {
        if (doc.uri.toString() === this.sourceUri.toString()) void this.load(doc);
      },
      undefined,
      this.disposables
    );

    void this.load(source);
  }

  /** Create or reveal the singleton panel and load the tree for `source`. */
  static show(fetchTree: (uri: vscode.Uri, text: string) => Promise<GuiTree>, source: vscode.TextDocument): void {
    if (GuiTreePanel.instance) {
      const inst = GuiTreePanel.instance;
      inst.sourceUri = source.uri;
      inst.panel.reveal(undefined, true);
      void inst.load(source);
      return;
    }
    GuiTreePanel.instance = new GuiTreePanel(fetchTree, source);
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    GuiTreePanel.instance = undefined;
    for (const d of this.disposables.splice(0)) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
    this.panel.dispose();
  }

  private async load(source: vscode.TextDocument): Promise<void> {
    this.post({ type: "loading" });
    this.panel.title = `CK3 GUI Tree — ${source.uri.path.split("/").pop() ?? "gui"}`;
    try {
      const tree = await this.fetchTree(source.uri, source.getText());
      if (this.disposed) return;
      this.post({ type: "tree", tree, file: source.uri.fsPath });
    } catch (err) {
      if (this.disposed) return;
      this.post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  private post(msg: OutboundMessage): void {
    if (this.disposed) return;
    void this.panel.webview.postMessage(msg);
  }

  private async onMessage(msg: InboundMessage): Promise<void> {
    if (msg.type === "open") {
      try {
        const doc = await vscode.workspace.openTextDocument(this.sourceUri);
        const position = new vscode.Position(Math.max(0, msg.line), 0);
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: false,
          selection: new vscode.Range(position, position),
        });
      } catch (err) {
        void vscode.window.showErrorMessage(
          `CK3 GUI Tree: cannot open source: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      return;
    }
    if (msg.type === "refresh") {
      try {
        const doc = await vscode.workspace.openTextDocument(this.sourceUri);
        await this.load(doc);
      } catch (err) {
        this.post({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }
  }
}

function buildHtml(webview: vscode.Webview): string {
  const nonce = makeNonce();
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CK3 GUI Tree</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; height: 100%;
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
  }
  #app { display: flex; flex-direction: column; height: 100%; }
  #toolbar {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 8px; flex: 0 0 auto;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
  }
  #filter {
    flex: 1 1 auto; min-width: 60px; padding: 3px 6px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
    border-radius: 2px;
  }
  #toolbar button {
    padding: 3px 10px; border: none; border-radius: 2px; cursor: pointer;
    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.4));
  }
  #tree { flex: 1 1 auto; overflow: auto; padding: 4px 0; }
  #status {
    flex: 0 0 auto; padding: 4px 8px; font-size: 0.9em;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    color: var(--vscode-descriptionForeground);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  ul.branch { list-style: none; margin: 0; padding-left: 16px; }
  #tree > ul.branch { padding-left: 6px; }
  .row {
    display: flex; align-items: center; gap: 6px;
    padding: 1px 4px; border-radius: 3px; cursor: pointer;
    white-space: nowrap;
  }
  .row:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.15)); }
  .twist { width: 14px; flex: 0 0 auto; text-align: center; user-select: none; opacity: 0.75; }
  .badge {
    padding: 0 6px; border-radius: 8px; font-size: 0.85em; flex: 0 0 auto;
    color: var(--vscode-badge-foreground, #fff);
    background: var(--vscode-charts-blue, #3794ff);
  }
  .badge.decl { background: var(--vscode-charts-purple, #b180d7); }
  .badge.state { background: var(--vscode-charts-yellow, #cca700); color: #222; }
  .wname { font-weight: 600; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .hidden { display: none; }
</style>
</head>
<body>
<div id="app">
  <div id="toolbar">
    <input id="filter" type="text" placeholder="filter by type or name…" />
    <button id="expand">Expand all</button>
    <button id="collapse">Collapse</button>
    <button id="refresh">Refresh</button>
  </div>
  <div id="tree"></div>
  <div id="status">Loading…</div>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const treeEl = document.getElementById("tree");
const statusEl = document.getElementById("status");
const filterEl = document.getElementById("filter");

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderNode(node) {
  const li = document.createElement("li");
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.line = String(node.line);
  row.dataset.text = (node.key + " " + (node.name || "") + " " + (node.base || "")).toLowerCase();

  const twist = document.createElement("span");
  twist.className = "twist";
  twist.textContent = node.children.length > 0 ? "▾" : "";
  row.appendChild(twist);

  const badge = document.createElement("span");
  badge.className = "badge" + (node.kind !== "widget" ? " " + node.kind : "");
  badge.textContent = node.key + (node.base ? " : " + node.base : "");
  row.appendChild(badge);

  if (node.name) {
    const name = document.createElement("span");
    name.className = "wname";
    name.textContent = node.name;
    row.appendChild(name);
  }
  const metaBits = [];
  if (node.using && node.using.length) metaBits.push("using " + node.using.join(", "));
  if (node.children.length > 0) metaBits.push(node.children.length + " children");
  if (metaBits.length) {
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = metaBits.join(" · ");
    row.appendChild(meta);
  }

  row.addEventListener("click", (ev) => {
    ev.stopPropagation();
    vscode.postMessage({ type: "open", line: node.line });
  });

  li.appendChild(row);
  if (node.children.length > 0) {
    const ul = document.createElement("ul");
    ul.className = "branch";
    for (const child of node.children) ul.appendChild(renderNode(child));
    li.appendChild(ul);
    twist.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const hidden = ul.classList.toggle("hidden");
      twist.textContent = hidden ? "▸" : "▾";
    });
  }
  return li;
}

function render(tree, file) {
  treeEl.textContent = "";
  if (!tree.nodes.length) {
    statusEl.textContent = "No widgets found in " + file;
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "branch";
  for (const node of tree.nodes) ul.appendChild(renderNode(node));
  treeEl.appendChild(ul);
  statusEl.textContent = tree.count + " widgets · " + file;
}

function applyFilter() {
  const q = filterEl.value.trim().toLowerCase();
  const rows = treeEl.querySelectorAll(".row");
  if (!q) {
    rows.forEach((r) => r.parentElement.classList.remove("hidden"));
    return;
  }
  // Show matches and their ancestors.
  rows.forEach((r) => r.parentElement.classList.add("hidden"));
  rows.forEach((r) => {
    if (r.dataset.text.indexOf(q) >= 0) {
      let el = r.parentElement;
      while (el && el !== treeEl) {
        if (el.tagName === "LI") el.classList.remove("hidden");
        if (el.tagName === "UL") el.classList.remove("hidden");
        el = el.parentElement;
      }
    }
  });
}

filterEl.addEventListener("input", applyFilter);
document.getElementById("expand").addEventListener("click", () => {
  treeEl.querySelectorAll("ul.branch").forEach((ul) => ul.classList.remove("hidden"));
  treeEl.querySelectorAll(".twist").forEach((t) => { if (t.textContent) t.textContent = "▾"; });
});
document.getElementById("collapse").addEventListener("click", () => {
  treeEl.querySelectorAll("#tree > ul.branch ul.branch").forEach((ul) => ul.classList.add("hidden"));
  treeEl.querySelectorAll(".twist").forEach((t) => { if (t.textContent) t.textContent = "▸"; });
});
document.getElementById("refresh").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));

window.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (!msg) return;
  if (msg.type === "loading") statusEl.textContent = "Loading…";
  else if (msg.type === "error") statusEl.textContent = "Error: " + msg.message;
  else if (msg.type === "tree") { render(msg.tree, msg.file); applyFilter(); }
});
</script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
