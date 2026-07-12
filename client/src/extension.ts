/**
 * Client entry point: starts the CK3 language server and keeps for itself only
 * what must live in the editor process — language-mode switching, tiger process
 * management and downloads, setup/Steam detection, the status bar, and commands
 * that touch the VS Code UI. All parsing/indexing/analysis lives in the server.
 */
import * as vscode from "vscode";
import * as path from "path";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";
import { readConfig, type Ck3Config } from "./config";
import { ensureFileAssociations, wireLanguageDetection } from "./languageMode";
import { findDownloadedTiger } from "./tigerDownload";
import { downloadTigerCommand, maybeNudgeSetup, runSetup, type SetupDeps } from "./setup";
import { Ck3StatusBar } from "./statusBar";
import { TigerRunner } from "./tiger/runner";
import {
  editLocalizationCommand,
  openLocalizationSideBySide,
  replaceLocLineValue,
  upsertNewModLoc,
  writeLocSmart,
  type LocLookup,
} from "./locCommands";
import { LocFileDefinitionProvider, LocReferenceTracker, jumpToScriptReference } from "./locNavigation";
import { createTranslationCommand } from "./translation";
import { openInfoDocsCommand } from "./infoDocs";
import { registerCk3Views } from "./views";
import { EventGraphPanel } from "./webviews/eventGraph/panel";
import { GuiTreePanel } from "./webviews/guiTree/panel";
import { GuiPreviewPanel } from "./webviews/guiPreview/panel";
import { DdsPreviewProvider } from "./ddsEditor";
import { convertToDdsCommand } from "./ddsConvert";
import { modReportCommand } from "./modReport";
import { generateTigerConfCommand } from "./tiger/conf";
import { ErrorLogWatcher, launchGameDebugCommand } from "./errorLog";
import { translateNextCommand } from "./translationLoop";
import { newContentCommand } from "./scaffold/command";
import { registerDescriptorMod } from "./descriptorMod";
import * as fs from "fs";
import {
  configChangedNotification,
  indexStatsRequest,
  lookupLocRequest,
  modFileChangedNotification,
  reloadDocsRequest,
  statusNotification,
  type Ck3InitOptions,
  type Ck3Settings,
  type Ck3StatusPayload,
  type LocEntryInfo,
  type LookupLocParams,
  type ReloadDocsResult,
  eventDetailRequest,
  eventGraphRequest,
  guiTreeRequest,
  guiLayoutRequest,
  type EventDetail,
  type EventDetailParams,
  type EventGraph,
  type EventGraphParams,
  type GuiTree,
  type GuiTreeParams,
  type GuiLayoutParams,
  type GuiLayoutResult,
  guiWidgetEditRequest,
  type GuiWidgetEditParams,
  type GuiWidgetEditResult,
} from "../../shared/src/protocol";
import type { IndexStats } from "../../shared/src/types";

const LOC_SELECTOR: vscode.DocumentSelector = { language: "paradox-loc", scheme: "file" };

let output: vscode.LogOutputChannel;
let cfg: Ck3Config;
let client: LanguageClient | undefined;

function log(msg: string): void {
  output.appendLine(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function toSettings(c: Ck3Config): Ck3Settings {
  return {
    gamePath: c.gamePath,
    logsPath: c.logsPath,
    modPath: c.modPath,
    parentPaths: c.parentPaths,
    locLanguage: c.locLanguage,
    scopeInlayHints: c.scopeInlayHints,
    diagnosticsIgnore: c.diagnosticsIgnore,
    diagnosticsIgnorePatterns: c.diagnosticsIgnorePatterns,
    diagnosticsVanilla: c.diagnosticsVanilla,
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  output = vscode.window.createOutputChannel("CK3 Modding Toolkit", { log: true });
  context.subscriptions.push(output);

  const storageDir = context.globalStorageUri.fsPath;

  // Effective tiger: explicit setting wins, else the copy we downloaded ourselves.
  const resolveConfig = () => {
    const c = readConfig();
    if (!c.tigerPath) c.tigerPath = findDownloadedTiger(storageDir);
    return c;
  };

  cfg = resolveConfig();
  if (cfg.warnings.length > 0) {
    // Fail soft: features degrade, extension still activates.
    void vscode.window.showWarningMessage(`CK3 Modding Toolkit: ${cfg.warnings.join(" — ")}`);
  }
  log(
    `activated. gamePath=${cfg.gamePath ?? "(none)"} logsPath=${cfg.logsPath ?? "(none)"} ` +
      `modPath=${cfg.modPath ?? "(none)"} parents=${cfg.parentPaths.length} tigerPath=${cfg.tigerPath ?? "(none)"}`
  );

  const reapplyLanguages = wireLanguageDetection(context, () => cfg);
  void ensureFileAssociations(cfg);

  const statusBar = new Ck3StatusBar();
  context.subscriptions.push(statusBar);
  let lastServerStatus: Ck3StatusPayload = {
    tokens: 0,
    tokensFromScriptDocs: false,
    definitions: 0,
    indexing: true,
  };
  const updateStatus = () => {
    statusBar.update({
      tokens: lastServerStatus.tokens,
      tokensFromScriptDocs: lastServerStatus.tokensFromScriptDocs,
      definitions: lastServerStatus.definitions,
      indexing: lastServerStatus.indexing,
      gameOk: cfg.gamePath !== null,
      modOk: cfg.modPath !== null,
      tigerOk: cfg.tigerPath !== null,
    });
  };
  updateStatus();

  const baselineFile = () => (cfg.modPath ? path.join(cfg.modPath, ".ck3modding", "tiger-baseline.json") : null);
  let tigerUnusedOnce = false;
  const tigerExtraArgs = (): string[] => {
    const args: string[] = [];
    const bl = baselineFile();
    if (context.workspaceState.get<boolean>("ck3.tigerBaselineEnabled") && bl && fs.existsSync(bl)) {
      args.push("--suppress", bl);
    }
    if (tigerUnusedOnce) {
      args.push("--unused");
      tigerUnusedOnce = false;
    }
    return args;
  };
  const tiger = new TigerRunner(() => cfg, log, tigerExtraArgs);
  context.subscriptions.push(tiger);
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => tiger.onDidSaveDocument(doc)));

  // descriptor.mod: completion/hover/diagnostics + missing-descriptor error.
  const descriptorFeature = registerDescriptorMod(context, () => cfg, log);
  context.subscriptions.push(descriptorFeature);

  // ---- language server -----------------------------------------------------

  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };
  const initOptions: Ck3InitOptions = {
    storageDir,
    wikidocsDir: context.asAbsolutePath("wikidocs"),
    settings: toSettings(cfg),
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: "paradox", scheme: "file" },
      { language: "paradox-loc", scheme: "file" },
      { language: "paradox-gui", scheme: "file" },
    ],
    initializationOptions: initOptions,
    outputChannel: output,
    progressOnInitialization: true,
    // Hover cards (§D) emit sanitized `<span style="color:var(--vscode-*)">` for
    // kind badges and scope pills. Opt in to the HTML subset; content degrades to
    // plain markdown on clients that strip it (client.js sanitizes, default off).
    markdown: { supportHtml: true },
  };
  const lc = new LanguageClient("ck3", "CK3 Modding", serverOptions, clientOptions);
  client = lc;

  lc.onNotification(statusNotification, (payload: Ck3StatusPayload) => {
    lastServerStatus = payload;
    updateStatus();
  });

  await lc.start();
  context.subscriptions.push({ dispose: () => void lc.stop() });

  const lookupLoc: LocLookup = (key) =>
    lc.sendRequest<LocEntryInfo[]>(lookupLocRequest, { key } satisfies LookupLocParams);

  // ---- mod file watching (forwarded to the server) --------------------------

  let modWatchers: vscode.FileSystemWatcher[] = [];
  const notifyModFileChanged = (fsPath: string) => {
    void lc.sendNotification(modFileChangedNotification, { fsPath });
  };
  // One watcher per root: the mod plus every parent mod, so edits in a parent
  // (multi-mod / compat-patch workspaces) re-index too.
  const wireModWatcher = () => {
    for (const w of modWatchers) w.dispose();
    modWatchers = [];
    for (const root of [cfg.modPath, ...cfg.parentPaths]) {
      if (!root) continue;
      const w = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(root), "**/*.{txt,yml,gui}")
      );
      w.onDidChange((uri) => notifyModFileChanged(uri.fsPath));
      w.onDidCreate((uri) => notifyModFileChanged(uri.fsPath));
      w.onDidDelete((uri) => notifyModFileChanged(uri.fsPath));
      modWatchers.push(w);
    }
  };
  wireModWatcher();
  context.subscriptions.push({ dispose: () => modWatchers.forEach((w) => w.dispose()) });

  const watchedRoots = (c: Ck3Config) => [c.modPath ?? "", ...c.parentPaths].join(";");

  // Recompute config-dependent state when settings change.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("ck3")) return;
      const oldRoots = watchedRoots(cfg);
      cfg = resolveConfig();
      tiger.resetErrorNotice();
      updateStatus();
      if (watchedRoots(cfg) !== oldRoots) {
        wireModWatcher();
        reapplyLanguages();
      }
      descriptorFeature.refresh();
      void lc.sendNotification(configChangedNotification, toSettings(cfg));
      // Re-run tiger so changed diagnostics suppression settings take effect.
      if (e.affectsConfiguration("ck3.diagnostics")) tiger.run(false);
    })
  );

  // Adding/removing workspace folders changes the parent-mod set (and possibly
  // the default modPath): recompute, rewire, re-run language detection.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      cfg = resolveConfig();
      updateStatus();
      wireModWatcher();
      reapplyLanguages();
      descriptorFeature.refresh();
      void lc.sendNotification(configChangedNotification, toSettings(cfg));
    })
  );

  // ---- client-side providers -------------------------------------------------

  const tracker = new LocReferenceTracker();
  tracker.wire(context);
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(LOC_SELECTOR, new LocFileDefinitionProvider(tracker, () => cfg))
  );

  // ---- commands ---------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand("ck3.reloadScriptDocs", async () => {
      const result = await lc.sendRequest<ReloadDocsResult>(reloadDocsRequest, { force: true });
      void vscode.window.showInformationMessage(`CK3: reloaded script_docs data (${result.tokens} tokens).`);
    }),
    vscode.commands.registerCommand("ck3.dumpIndexStats", async () => {
      const stats = await lc.sendRequest<IndexStats>(indexStatsRequest);
      log(`index stats: ${JSON.stringify(stats, null, 2)}`);
      output.show(true);
    }),
    vscode.commands.registerCommand("ck3.runTiger", () => tiger.run(true)),
    vscode.commands.registerCommand("ck3.editLocalization", (arg?: unknown) =>
      editLocalizationCommand(lookupLoc, cfg, notifyModFileChanged, arg)
    ),
    vscode.commands.registerCommand("ck3.openLocalizationSideBySide", (arg?: unknown) =>
      openLocalizationSideBySide(lookupLoc, arg)
    ),
    vscode.commands.registerCommand("ck3.jumpToScriptReference", () => jumpToScriptReference(tracker, cfg)),
    vscode.commands.registerCommand("ck3.createTranslation", () => createTranslationCommand(cfg, log)),
    vscode.commands.registerCommand("ck3.openInfoDocs", () => openInfoDocsCommand(cfg)),
    vscode.commands.registerCommand("ck3.convertToDds", (arg?: vscode.Uri, multi?: vscode.Uri[]) =>
      convertToDdsCommand(arg, multi)
    ),
    vscode.commands.registerCommand("ck3.imageGuidelines", () =>
      vscode.commands.executeCommand(
        "markdown.showPreview",
        vscode.Uri.file(context.asAbsolutePath("media/image-guidelines.md"))
      )
    ),
    vscode.commands.registerCommand("ck3.tutorial", () =>
      vscode.commands.executeCommand(
        "markdown.showPreview",
        vscode.Uri.file(context.asAbsolutePath("media/tutorial/index.md"))
      )
    ),
    DdsPreviewProvider.register(context)
  );

  // ---- overview suite --------------------------------------------------------

  const views = registerCk3Views(context, lc);
  const fetchGraph = (params: EventGraphParams) => lc.sendRequest<EventGraph>(eventGraphRequest, params);
  // Inspector actions: loc writes reuse the BOM-correct edit machinery; the
  // option scaffold inserts before the event's closing brace and creates loc.
  const graphActions = {
    fetchDetail: (id: string) =>
      lc.sendRequest<EventDetail | null>(eventDetailRequest, { id } satisfies EventDetailParams),
    async editLoc(key: string, value: string, file?: string, line?: number): Promise<void> {
      if (file !== undefined && line !== undefined) {
        if (!replaceLocLineValue(file, line, value)) throw new Error(`line ${line + 1} is not a loc entry anymore`);
        notifyModFileChanged(file);
        return;
      }
      if (!cfg.modPath) throw new Error("no mod folder configured");
      // Vanilla-only keys go to the replace override; new keys to the mod's
      // sibling loc file — never new keys into localization/replace.
      const target = await writeLocSmart(cfg, lookupLoc, key, value);
      notifyModFileChanged(target);
    },
    async addOption(id: string, file: string, endLine: number, count: number): Promise<void> {
      const optionKey = `${id}.${String.fromCharCode(97 + Math.min(count, 25))}`;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const edit = new vscode.WorkspaceEdit();
      edit.insert(
        doc.uri,
        new vscode.Position(endLine, 0),
        `\toption = {\n\t\tname = ${optionKey}\n\t}\n`
      );
      if (!(await vscode.workspace.applyEdit(edit))) throw new Error("edit rejected");
      await doc.save();
      notifyModFileChanged(file);
      if (cfg.modPath) {
        const locFile = upsertNewModLoc(cfg, optionKey, "New option");
        notifyModFileChanged(locFile);
      }
    },
  };
  context.subscriptions.push(
    vscode.commands.registerCommand("ck3.refreshViews", () => views.refreshAll()),
    vscode.commands.registerCommand("ck3.showEventGraph", () => {
      // Seed the graph from where the user is: the event id under the cursor,
      // an on_action/decision name in the matching folders, or the file's
      // namespace — so opening from an applicable file shows related nodes.
      const editor = vscode.window.activeTextEditor;
      let params: EventGraphParams = {};
      if (editor && editor.document.languageId === "paradox") {
        const fsPath = editor.document.uri.fsPath.replace(/\\/g, "/").toLowerCase();
        const range = editor.document.getWordRangeAtPosition(
          editor.selection.active,
          /[A-Za-z0-9_.\-]+/
        );
        const word = range ? editor.document.getText(range) : "";
        if (/^[A-Za-z0-9_\-]+\.\d+$/.test(word)) {
          params = { root: word };
        } else if (/\/(on_action|decisions)\//.test(fsPath) && /^[A-Za-z0-9_\-]{3,}$/.test(word)) {
          params = { root: word };
        } else {
          const ns = /(?:^|\n)\s*namespace\s*=\s*([A-Za-z0-9_\-]+)/.exec(editor.document.getText());
          if (ns) params = { namespace: ns[1] };
        }
      }
      EventGraphPanel.show(context, fetchGraph, params, graphActions);
    }),
    vscode.commands.registerCommand("ck3.showGuiTree", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.uri.fsPath.toLowerCase().endsWith(".gui")) {
        void vscode.window.showWarningMessage("CK3: open a .gui file first.");
        return;
      }
      GuiTreePanel.show(
        (uri, text) =>
          lc.sendRequest<GuiTree>(guiTreeRequest, { uri: uri.toString(), text } satisfies GuiTreeParams),
        editor.document
      );
    }),
    vscode.commands.registerCommand("ck3.showGuiPreview", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.uri.fsPath.toLowerCase().endsWith(".gui")) {
        void vscode.window.showWarningMessage("CK3: open a .gui file first.");
        return;
      }
      GuiPreviewPanel.show(
        (uri, text) =>
          lc.sendRequest<GuiLayoutResult>(guiLayoutRequest, {
            uri: uri.toString(),
            text,
          } satisfies GuiLayoutParams),
        (uri, text, line, property, values) =>
          lc.sendRequest<GuiWidgetEditResult | null>(guiWidgetEditRequest, {
            uri: uri.toString(),
            text,
            line,
            property,
            values,
          } satisfies GuiWidgetEditParams),
        editor.document,
        { gamePath: cfg.gamePath, modPath: cfg.modPath }
      );
    }),
    vscode.commands.registerCommand("ck3.modReport", () => modReportCommand(lc)),
    vscode.commands.registerCommand("ck3.tigerGenerateConf", () => generateTigerConfCommand(cfg)),
    vscode.commands.registerCommand("ck3.tigerCreateBaseline", async () => {
      const bl = baselineFile();
      if (!bl) {
        void vscode.window.showWarningMessage("CK3: no mod folder.");
        return;
      }
      const count = await tiger.createBaseline(bl);
      if (count !== null) {
        await context.workspaceState.update("ck3.tigerBaselineEnabled", true);
        void vscode.window.showInformationMessage(
          `CK3: baseline saved (${count} current reports suppressed). Tiger now shows new problems only.`
        );
        tiger.run(false);
      }
    }),
    vscode.commands.registerCommand("ck3.tigerToggleBaseline", async () => {
      const enabled = !context.workspaceState.get<boolean>("ck3.tigerBaselineEnabled");
      await context.workspaceState.update("ck3.tigerBaselineEnabled", enabled);
      void vscode.window.showInformationMessage(
        enabled
          ? "CK3: tiger baseline ON — only problems newer than the baseline are shown."
          : "CK3: tiger baseline OFF — all problems are shown."
      );
      tiger.run(false);
    }),
    vscode.commands.registerCommand("ck3.tigerUnused", () => {
      tigerUnusedOnce = true;
      tiger.run(true);
    })
  );

  // ---- workflow accelerators ---------------------------------------------------

  const errorLog = new ErrorLogWatcher(() => cfg, log);
  context.subscriptions.push(errorLog);
  context.subscriptions.push(
    vscode.commands.registerCommand("ck3.watchErrorLog", () => errorLog.toggle()),
    vscode.commands.registerCommand("ck3.launchGame", () => launchGameDebugCommand()),
    vscode.commands.registerCommand("ck3.translateNext", () => translateNextCommand(lc, cfg, notifyModFileChanged)),
    vscode.commands.registerCommand("ck3.newContent", () => newContentCommand(cfg, notifyModFileChanged))
  );

  // ---- onboarding ---------------------------------------------------------------

  const setupDeps: SetupDeps = {
    storageDir,
    getConfig: () => cfg,
    refresh: () => {
      cfg = resolveConfig();
      tiger.resetErrorNotice();
      updateStatus();
      void lc.sendNotification(configChangedNotification, toSettings(cfg));
    },
    log,
  };
  context.subscriptions.push(
    vscode.commands.registerCommand("ck3.setup", () => runSetup(setupDeps)),
    vscode.commands.registerCommand("ck3.downloadTiger", () => downloadTigerCommand(setupDeps, false))
  );
  maybeNudgeSetup(context, cfg);
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
