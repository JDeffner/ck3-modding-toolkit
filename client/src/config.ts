import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { sanitizeStringList } from "../../shared/src/suppression";

export interface Ck3Config {
  /** Path to `Crusader Kings III/game`, or null if unset/invalid. */
  gamePath: string | null;
  /** Folder holding script_docs logs, or null if it cannot be found. */
  logsPath: string | null;
  /** ck3-tiger binary, or null (diagnostics disabled). */
  tigerPath: string | null;
  /** Mod folder; defaults to the first workspace folder. */
  modPath: string | null;
  /** Parent/dependency mod roots: `ck3.parentMods` plus any additional
   * workspace folder that looks like a CK3 mod. Load order, base first. */
  parentPaths: string[];
  locLanguage: string;
  scopeInlayHints: boolean;
  tigerRunOn: "save" | "manual";
  enableForWorkspace: boolean;
  /** Diagnostic codes (ours + tiger keys) to suppress everywhere. */
  diagnosticsIgnore: string[];
  /** Glob patterns matched against workspace-relative paths to suppress. */
  diagnosticsIgnorePatterns: string[];
  /** When false (default) tiger/our diagnostics skip files under the game path. */
  diagnosticsVanilla: boolean;
  /** Human-readable problems found while validating paths. */
  warnings: string[];
}

/**
 * The Documents folder can be redirected away from %USERPROFILE%\Documents
 * (OneDrive, or a plain move to another drive), so ask the shell via the
 * registry first and fall back to the conventional location.
 */
function windowsDocumentsFolder(): string {
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "Personal"],
      { encoding: "utf8", windowsHide: true }
    );
    const m = /Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/.exec(out);
    if (m) {
      const expanded = m[1].trim().replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`);
      if (fs.existsSync(expanded)) return expanded;
    }
  } catch {
    // reg query unavailable or failed; use the conventional path.
  }
  return path.join(os.homedir(), "Documents");
}

function defaultLogsPath(): string | null {
  const suffix = ["Paradox Interactive", "Crusader Kings III", "logs"];
  const candidates: string[] = [];
  if (process.platform === "win32") {
    candidates.push(path.join(windowsDocumentsFolder(), ...suffix));
  } else if (process.platform === "darwin") {
    candidates.push(path.join(os.homedir(), "Documents", ...suffix));
  } else {
    candidates.push(path.join(os.homedir(), ".local", "share", ...suffix));
    // Steam Proton prefix (documented fallback; the setting covers exotic setups).
    candidates.push(
      path.join(
        os.homedir(),
        ".steam/steam/steamapps/compatdata/1158310/pfx/drive_c/users/steamuser/Documents",
        ...suffix
      )
    );
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function readConfig(): Ck3Config {
  const cfg = vscode.workspace.getConfiguration("ck3");
  const warnings: string[] = [];

  const readPath = (key: string, label: string): string | null => {
    const value = (cfg.get<string>(key) ?? "").trim();
    if (value === "") return null;
    if (!fs.existsSync(value)) {
      warnings.push(`${label} ("ck3.${key}") does not exist: ${value}`);
      return null;
    }
    return value;
  };

  const gamePath = readPath("gamePath", "Game path");
  let logsPath = readPath("logsPath", "script_docs logs path");
  if (logsPath === null && (cfg.get<string>("logsPath") ?? "").trim() === "") {
    logsPath = defaultLogsPath();
  }

  const tigerPath = readPath("tigerPath", "ck3-tiger path");

  let modPath = readPath("modPath", "Mod path");
  if (modPath === null && (cfg.get<string>("modPath") ?? "").trim() === "") {
    modPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  // Parent mods (submod / compatibility-patch workflow): the explicit setting
  // first (load order), then any additional workspace folder that looks like a
  // CK3 mod — open the submod plus its parents as workspace folders and the
  // whole playset resolves, CW Tools style.
  const parentPaths: string[] = [];
  const seenParents = new Set<string>();
  const addParent = (p: string) => {
    const key = p.toLowerCase();
    if (seenParents.has(key)) return;
    if (modPath && key === modPath.toLowerCase()) return;
    if (gamePath && key === gamePath.toLowerCase()) return;
    seenParents.add(key);
    parentPaths.push(p);
  };
  for (const raw of sanitizeStringList(cfg.get("parentMods"))) {
    const value = raw.trim();
    if (value === "") continue;
    if (!fs.existsSync(value)) {
      warnings.push(`Parent mod ("ck3.parentMods") does not exist: ${value}`);
      continue;
    }
    addParent(value);
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const p = folder.uri.fsPath;
    if (looksLikeMod(p)) addParent(p);
  }

  const tigerRunOn = cfg.get<string>("tigerRunOn") === "manual" ? "manual" : "save";

  return {
    gamePath,
    logsPath,
    tigerPath,
    modPath,
    parentPaths,
    locLanguage: (cfg.get<string>("locLanguage") ?? "english").trim().toLowerCase() || "english",
    scopeInlayHints: cfg.get<boolean>("scopeInlayHints") ?? false,
    tigerRunOn,
    enableForWorkspace: cfg.get<boolean>("enableForWorkspace") ?? true,
    diagnosticsIgnore: sanitizeStringList(cfg.get("diagnostics.ignore")),
    diagnosticsIgnorePatterns: sanitizeStringList(cfg.get("diagnostics.ignorePatterns")),
    diagnosticsVanilla: cfg.get<boolean>("diagnostics.vanilla") ?? false,
    warnings,
  };
}

/** A folder counts as a CK3 mod if it has a descriptor or the usual content dirs. */
export function looksLikeMod(dir: string): boolean {
  try {
    if (fs.existsSync(path.join(dir, "descriptor.mod"))) return true;
    return ["common", "events", "localization", "gui", "history"].some((d) =>
      fs.existsSync(path.join(dir, d))
    );
  } catch {
    return false;
  }
}

export function isUnder(root: string | null, file: string): boolean {
  if (!root) return false;
  const rel = path.relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
