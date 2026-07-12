/**
 * DDS preview: a read-only custom editor for *.dds so clicking a texture shows
 * the image instead of VS Code's "binary or unsupported encoding" notice.
 * Decoding runs in the extension host with the same pure-TS decoder the hover
 * previews use (DXT1/3/5, BC7, uncompressed); the webview only displays.
 */
import * as vscode from "vscode";
import { decodeDds, ddsFormatInfo, encodePng } from "../../server/src/dds";

class DdsDocument implements vscode.CustomDocument {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly bytes: Uint8Array
  ) {}
  dispose(): void {
    /* nothing to release */
  }
}

export class DdsPreviewProvider implements vscode.CustomReadonlyEditorProvider<DdsDocument> {
  static readonly viewType = "ck3.ddsPreview";
  private static readonly promptKey = "ck3.ddsPreviewPromptShown";

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      DdsPreviewProvider.viewType,
      new DdsPreviewProvider(context),
      { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true }
    );
  }

  /**
   * One-time choice on the very first .dds open: keep this preview as the
   * default editor for .dds, or hand the extension back to VS Code's default
   * (via workbench.editorAssociations, which the user can change any time).
   */
  private async maybePromptForDefault(): Promise<void> {
    if (this.context.globalState.get<boolean>(DdsPreviewProvider.promptKey)) return;
    await this.context.globalState.update(DdsPreviewProvider.promptKey, true);
    const keep = "Keep DDS preview";
    const builtin = "Use VS Code default";
    const answer = await vscode.window.showInformationMessage(
      "The CK3 Modding Toolkit now previews .dds textures. Keep it as the default editor for .dds files?",
      keep,
      builtin
    );
    if (answer === builtin) {
      const config = vscode.workspace.getConfiguration();
      const assoc = { ...(config.get<Record<string, string>>("workbench.editorAssociations") ?? {}) };
      assoc["*.dds"] = "default";
      await config.update("workbench.editorAssociations", assoc, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(
        "CK3: .dds files will use the VS Code default editor. Right-click a .dds → 'Open With…' to preview one anyway, or edit workbench.editorAssociations to undo."
      );
    }
  }

  async openCustomDocument(uri: vscode.Uri): Promise<DdsDocument> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new DdsDocument(uri, bytes);
  }

  async resolveCustomEditor(document: DdsDocument, panel: vscode.WebviewPanel): Promise<void> {
    void this.maybePromptForDefault();
    panel.webview.options = { enableScripts: true, localResourceRoots: [] };
    const name = document.uri.path.split("/").pop() ?? "texture.dds";
    const info = ddsFormatInfo(document.bytes);
    let body: string;
    if (!info) {
      body = errorHtml(`${name} is not a DDS file (bad magic).`);
    } else {
      try {
        const img = decodeDds(document.bytes);
        const png = encodePng(img.width, img.height, img.pixels);
        const dataUri = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
        const kb = (document.bytes.length / 1024).toFixed(1);
        body = imageHtml(dataUri, `${name} · ${info.format} · ${img.width}×${img.height} · ${kb} KB`);
      } catch (err) {
        body = errorHtml(
          `${name}: ${info.format} ${info.width}×${info.height} — preview failed: ` +
            (err instanceof Error ? err.message : String(err))
        );
      }
    }
    panel.webview.html = wrapHtml(body);
  }
}

function wrapHtml(body: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; height: 100%; font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
  #bar {
    position: sticky; top: 0; display: flex; gap: 10px; align-items: center;
    padding: 5px 10px; font-size: 0.9em;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
  }
  #bar button {
    padding: 1px 8px; cursor: pointer; border-radius: 2px;
    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.4));
  }
  #stage {
    display: flex; align-items: center; justify-content: center;
    min-height: calc(100% - 32px); overflow: auto; padding: 16px;
  }
  #img {
    image-rendering: auto;
    /* checkerboard so alpha is visible */
    background: repeating-conic-gradient(rgba(128,128,128,0.25) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
  }
  #img.pixelated { image-rendering: pixelated; }
  .err { padding: 24px; color: var(--vscode-editorError-foreground, #f14c4c); }
</style>
</head>
<body>${body}</body>
</html>`;
}

function imageHtml(dataUri: string, caption: string): string {
  return /* html */ `
<div id="bar">
  <span>${escapeHtml(caption)}</span>
  <button id="zin">+</button><button id="zout">−</button><button id="zfit">Fit</button><button id="z100">1:1</button>
  <label><input type="checkbox" id="pix" checked /> pixelated</label>
</div>
<div id="stage"><img id="img" class="pixelated" src="${dataUri}" /></div>
<script>
  const img = document.getElementById("img");
  let scale = 1;
  function apply() { img.style.width = (img.naturalWidth * scale) + "px"; }
  img.addEventListener("load", () => {
    const stage = document.getElementById("stage");
    const fit = Math.min(1, (stage.clientWidth - 40) / img.naturalWidth, (stage.clientHeight - 40) / img.naturalHeight);
    scale = fit > 0 ? Math.min(1, fit) : 1;
    apply();
  });
  document.getElementById("zin").addEventListener("click", () => { scale *= 1.25; apply(); });
  document.getElementById("zout").addEventListener("click", () => { scale /= 1.25; apply(); });
  document.getElementById("z100").addEventListener("click", () => { scale = 1; apply(); });
  document.getElementById("zfit").addEventListener("click", () => {
    const stage = document.getElementById("stage");
    scale = Math.min(1, (stage.clientWidth - 40) / img.naturalWidth, (stage.clientHeight - 40) / img.naturalHeight);
    apply();
  });
  document.getElementById("pix").addEventListener("change", (e) => img.classList.toggle("pixelated", e.target.checked));
</script>`;
}

function errorHtml(message: string): string {
  return `<div class="err">${escapeHtml(message)}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
