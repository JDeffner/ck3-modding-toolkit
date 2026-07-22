# paradox-lsp

Monorepo for the Paradox-script language tooling:

- [`packages/server`](packages/server) — `@paradox-lsp/server`, the language
  server (node-ipc and `--stdio`).
- [`packages/protocol`](packages/protocol) — `@paradox-lsp/protocol`, the wire
  contract (custom requests/notifications, settings types) plus helpers shared
  between server and clients.
- [`packages/vscode`](packages/vscode) — the **CK3 Modding Toolkit** VS Code
  extension ([marketplace](https://marketplace.visualstudio.com/items?itemName=JDeffner.ck3-modding-toolkit)),
  the primary client. Its README is the user-facing one.

Development: `pnpm install`, then `pnpm run compile` (bundles server +
extension), `pnpm test` (vitest), `pnpm run typecheck`. Corpus-gated tests and
dev scripts read machine paths from `dev-paths.json` (copy
`dev-paths.example.json`).

License: GPL-3.0-or-later.
