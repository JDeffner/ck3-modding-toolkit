/**
 * The CK3 activity-bar container (rework plan AD-7): native tree views —
 * Tools, Mod Overview, Problems by Type, Localization Coverage, Overrides &
 * Conflicts. All data comes from the language server via ck3/* requests
 * (except Problems, which slices the editor's own diagnostics); views refresh
 * on the server's ck3/indexChanged notification.
 */
import * as vscode from "vscode";
import * as path from "path";
import type { LanguageClient } from "vscode-languageclient/node";
import {
  indexChangedNotification,
  locCoverageRequest,
  modOverviewRequest,
  overridesRequest,
  type LocCoverage,
  type ModOverview,
  type OverrideInfo,
} from "../../shared/src/protocol";

function openCommand(file: string, line: number): vscode.Command {
  return {
    command: "vscode.open",
    title: "Open",
    arguments: [
      vscode.Uri.file(file),
      { selection: new vscode.Range(line, 0, line, 0), preview: true } satisfies vscode.TextDocumentShowOptions,
    ],
  };
}

class Node extends vscode.TreeItem {
  children: Node[] = [];
  /** For loc-coverage items: the loc key, consumed by ck3.addLocalizationFromView. */
  ck3Key?: string;

  constructor(label: string, state: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None) {
    super(label, state);
  }
}

abstract class BaseProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node;
  }

  getChildren(node?: Node): vscode.ProviderResult<Node[]> {
    if (node) return node.children;
    return this.roots();
  }

  protected abstract roots(): Promise<Node[]>;
}

// ---- Mod Overview -------------------------------------------------------------

class OverviewProvider extends BaseProvider {
  constructor(private readonly lc: LanguageClient) {
    super();
  }

  protected async roots(): Promise<Node[]> {
    const overview = await this.lc.sendRequest<ModOverview>(modOverviewRequest);
    if (overview.kinds.length === 0) {
      const empty = new Node("No mod content indexed");
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }
    return overview.kinds.map((k) => {
      const node = new Node(
        `${k.kind.replace(/_/g, " ")} (${k.count})`,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      node.iconPath = new vscode.ThemeIcon("symbol-class");
      node.children = k.defs.map((d) => {
        const child = new Node(d.name);
        child.description = path.basename(d.file);
        child.command = openCommand(d.file, d.line);
        child.iconPath = new vscode.ThemeIcon("symbol-field");
        return child;
      });
      if (k.count > k.defs.length) {
        node.children.push(new Node(`… ${k.count - k.defs.length} more`));
      }
      return node;
    });
  }
}

// ---- Problems Summary ------------------------------------------------------------

const SEVERITY_ORDER: Array<[vscode.DiagnosticSeverity, string, string]> = [
  [vscode.DiagnosticSeverity.Error, "Errors", "error"],
  [vscode.DiagnosticSeverity.Warning, "Warnings", "warning"],
  [vscode.DiagnosticSeverity.Information, "Info", "info"],
  [vscode.DiagnosticSeverity.Hint, "Hints", "lightbulb"],
];

class ProblemsProvider extends BaseProvider {
  protected async roots(): Promise<Node[]> {
    const all = vscode.languages.getDiagnostics();
    const bySeverity = new Map<vscode.DiagnosticSeverity, Map<string, Map<string, vscode.Diagnostic[]>>>();
    for (const [uri, diags] of all) {
      for (const d of diags) {
        let byKey = bySeverity.get(d.severity);
        if (!byKey) bySeverity.set(d.severity, (byKey = new Map()));
        const code = typeof d.code === "object" ? String(d.code.value) : String(d.code ?? "other");
        const key = `${d.source ?? "?"} · ${code}`;
        let byFile = byKey.get(key);
        if (!byFile) byKey.set(key, (byFile = new Map()));
        const f = uri.fsPath;
        let list = byFile.get(f);
        if (!list) byFile.set(f, (list = []));
        list.push(d);
      }
    }

    const roots: Node[] = [];
    for (const [severity, label, icon] of SEVERITY_ORDER) {
      const byKey = bySeverity.get(severity);
      if (!byKey) continue;
      let total = 0;
      for (const byFile of byKey.values()) for (const list of byFile.values()) total += list.length;
      const sevNode = new Node(`${label} (${total})`, vscode.TreeItemCollapsibleState.Expanded);
      sevNode.iconPath = new vscode.ThemeIcon(icon);
      for (const [key, byFile] of [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        let keyTotal = 0;
        for (const list of byFile.values()) keyTotal += list.length;
        const keyNode = new Node(`${key} (${keyTotal})`, vscode.TreeItemCollapsibleState.Collapsed);
        keyNode.iconPath = new vscode.ThemeIcon("tag");
        for (const [file, list] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          const fileNode = new Node(path.basename(file));
          fileNode.description = `${list.length}×`;
          fileNode.tooltip = list[0].message;
          fileNode.command = openCommand(file, list[0].range.start.line);
          fileNode.iconPath = new vscode.ThemeIcon("file");
          keyNode.children.push(fileNode);
        }
        sevNode.children.push(keyNode);
      }
      roots.push(sevNode);
    }
    if (roots.length === 0) {
      const ok = new Node("No problems reported");
      ok.iconPath = new vscode.ThemeIcon("check");
      return [ok];
    }
    return roots;
  }
}

// ---- Localization Coverage -----------------------------------------------------------

class LocCoverageProvider extends BaseProvider {
  constructor(private readonly lc: LanguageClient) {
    super();
  }

  protected async roots(): Promise<Node[]> {
    const coverage = await this.lc.sendRequest<LocCoverage[]>(locCoverageRequest);
    if (coverage.length === 0) {
      const empty = new Node("No localization files in the mod");
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }
    return coverage.map((lang) => {
      const issues = lang.missing.length + lang.orphaned.length + lang.untranslated.length;
      const node = new Node(
        `${lang.language} — ${lang.defined} keys${issues > 0 ? `, ${issues} issue(s)` : ""}`,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      node.iconPath = new vscode.ThemeIcon(issues > 0 ? "globe" : "check");
      const category = (
        label: string,
        icon: string,
        items: LocCoverage["missing"],
        contextValue: string,
        value?: boolean
      ) => {
        if (items.length === 0) return;
        const cat = new Node(`${label} (${items.length})`, vscode.TreeItemCollapsibleState.Collapsed);
        cat.iconPath = new vscode.ThemeIcon(icon);
        cat.children = items.map((i) => {
          const item = new Node(i.key);
          if (i.file !== undefined && i.line !== undefined) item.command = openCommand(i.file, i.line);
          if (value && i.value) item.description = i.value.slice(0, 60);
          item.iconPath = new vscode.ThemeIcon("symbol-string");
          item.contextValue = contextValue;
          item.ck3Key = i.key;
          return item;
        });
        node.children.push(cat);
      };
      // Missing keys carry an inline "Add localization…" action (ck3.locMissing).
      category("Missing (referenced but not defined)", "error", lang.missing, "ck3.locMissing");
      category("Orphaned (defined but never referenced)", "circle-slash", lang.orphaned, "ck3.locKey");
      category("Untranslated (identical to source)", "arrow-right", lang.untranslated, "ck3.locKey", true);
      if (node.children.length === 0) {
        const ok = new Node("Complete");
        ok.iconPath = new vscode.ThemeIcon("check");
        node.children.push(ok);
      }
      return node;
    });
  }
}

// ---- Overrides & Conflicts ------------------------------------------------------------

class OverridesProvider extends BaseProvider {
  constructor(private readonly lc: LanguageClient) {
    super();
  }

  protected async roots(): Promise<Node[]> {
    const overrides = await this.lc.sendRequest<OverrideInfo[]>(overridesRequest);
    if (overrides.length === 0) {
      const empty = new Node("No vanilla/parent definitions are overridden");
      empty.iconPath = new vscode.ThemeIcon("check");
      return [empty];
    }
    const byKind = new Map<string, OverrideInfo[]>();
    for (const o of overrides) {
      let list = byKind.get(o.kind);
      if (!list) byKind.set(o.kind, (list = []));
      list.push(o);
    }
    return [...byKind.entries()].map(([kind, list]) => {
      const kindNode = new Node(
        `${kind.replace(/_/g, " ")} (${list.length})`,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      kindNode.iconPath = new vscode.ThemeIcon("symbol-class");
      kindNode.children = list.map((o) => {
        const won = o.winner === "mod";
        const node = new Node(o.name, vscode.TreeItemCollapsibleState.Collapsed);
        node.description = `${o.rule} — ${won ? "mod wins" : "vanilla wins"}`;
        node.iconPath = new vscode.ThemeIcon(won ? "arrow-swap" : "warning");
        node.tooltip = o.note;
        node.command = openCommand(o.mod.file, o.mod.line);
        node.children = o.shadowed.map((s) => {
          const site = new Node(`${s.source}: ${path.basename(s.file)}`);
          site.command = openCommand(s.file, s.line);
          site.iconPath = new vscode.ThemeIcon("references");
          return site;
        });
        return node;
      });
      return kindNode;
    });
  }
}

// ---- Tools -----------------------------------------------------------------------------

/** One-click launcher for the extension's commands, grouped by workflow. */
const TOOL_GROUPS: Array<[group: string, items: Array<[label: string, command: string, icon: string]>]> = [
  [
    "Create",
    [
      ["New Content (event, decision, …)", "ck3.newContent", "new-file"],
    ],
  ],
  [
    "Localization",
    [
      ["Add Language (scaffold files)", "ck3.createTranslation", "globe"],
      ["Translate Missing Keys (one by one)", "ck3.translateNext", "arrow-right"],
    ],
  ],
  [
    "Images",
    [
      ["Convert Image to DDS", "ck3.convertToDds", "file-media"],
      ["Image Guidelines (sizes & formats)", "ck3.imageGuidelines", "book"],
    ],
  ],
  [
    "Inspect",
    [
      ["Event Graph", "ck3.showEventGraph", "type-hierarchy"],
      ["GUI Widget Tree (open a .gui first)", "ck3.showGuiTree", "list-tree"],
      ["GUI Layout Preview (open a .gui first)", "ck3.showGuiPreview", "preview"],
      ["Mod Report", "ck3.modReport", "output"],
      ["Format Docs (.info) for This File", "ck3.openInfoDocs", "question"],
    ],
  ],
  [
    "Validate & Test",
    [
      ["Run Tiger Validation", "ck3.runTiger", "bug"],
      ["Launch CK3 (debug mode)", "ck3.launchGame", "play"],
      ["Toggle error.log Watcher", "ck3.watchErrorLog", "eye"],
      ["Run Setup & Health Check", "ck3.setup", "tools"],
    ],
  ],
  [
    "Learn",
    [
      ["Tutorial: CK3 Modding from Zero", "ck3.tutorial", "mortar-board"],
    ],
  ],
];

class ToolsProvider extends BaseProvider {
  protected async roots(): Promise<Node[]> {
    return TOOL_GROUPS.map(([group, items]) => {
      const g = new Node(group, vscode.TreeItemCollapsibleState.Expanded);
      g.children = items.map(([label, command, icon]) => {
        const item = new Node(label);
        item.iconPath = new vscode.ThemeIcon(icon);
        item.command = { command, title: label };
        return item;
      });
      return g;
    });
  }
}

// ---- registration ----------------------------------------------------------------------

export interface Ck3Views {
  refreshAll(): void;
}

export function registerCk3Views(context: vscode.ExtensionContext, lc: LanguageClient): Ck3Views {
  const overview = new OverviewProvider(lc);
  const problems = new ProblemsProvider();
  const locCoverage = new LocCoverageProvider(lc);
  const overrides = new OverridesProvider(lc);
  const tools = new ToolsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("ck3.overview", overview),
    vscode.window.registerTreeDataProvider("ck3.problems", problems),
    vscode.window.registerTreeDataProvider("ck3.locCoverage", locCoverage),
    vscode.window.registerTreeDataProvider("ck3.overrides", overrides),
    vscode.window.registerTreeDataProvider("ck3.tools", tools),
    vscode.commands.registerCommand("ck3.addLocalizationFromView", (node?: { ck3Key?: string }) =>
      vscode.commands.executeCommand("ck3.editLocalization", node?.ck3Key)
    )
  );

  const refreshServerBacked = () => {
    overview.refresh();
    locCoverage.refresh();
    overrides.refresh();
  };
  lc.onNotification(indexChangedNotification, refreshServerBacked);

  let diagTimer: ReturnType<typeof setTimeout> | null = null;
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      if (diagTimer) clearTimeout(diagTimer);
      diagTimer = setTimeout(() => problems.refresh(), 500);
    })
  );

  return {
    refreshAll() {
      refreshServerBacked();
      problems.refresh();
    },
  };
}
