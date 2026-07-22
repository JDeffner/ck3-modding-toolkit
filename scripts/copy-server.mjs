// Copy the server bundle and its runtime data into the vscode package so the
// .vsix (and F5 dev host) are self-contained. Paths are relative to this file,
// not the cwd.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const server = join(root, "packages", "server");
const vscode = join(root, "packages", "vscode");

mkdirSync(join(vscode, "dist"), { recursive: true });
cpSync(join(server, "dist", "server.js"), join(vscode, "dist", "server.js"));
mkdirSync(join(vscode, "data", "ck3"), { recursive: true });
cpSync(join(server, "data", "ck3", "freqs.json"), join(vscode, "data", "ck3", "freqs.json"));
cpSync(join(server, "data", "ck3", "wikidocs"), join(vscode, "data", "ck3", "wikidocs"), { recursive: true });
