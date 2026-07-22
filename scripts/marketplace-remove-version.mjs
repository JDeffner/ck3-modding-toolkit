// Remove ONE version of the extension from the VS Code Marketplace so the
// previously published version becomes "latest" again. Driven by
// .github/workflows/release.yml when a GitHub Release is deleted; also
// runnable locally:
//
//   VSCE_PAT=... node scripts/marketplace-remove-version.mjs 0.1.2
//
// This is the same azure-devops-node-api call vsce's `unpublish` makes, plus
// the per-version argument the vsce CLI doesn't expose. deleteExtension
// WITHOUT a version removes the entire extension — the strict version check
// below is what stands between a rollback and a full unpublish.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { GalleryApi } = require("azure-devops-node-api/GalleryApi");
const { getBasicHandler } = require("azure-devops-node-api/WebApi");

const version = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `Refusing to run: "${version}" is not an x.y.z version.\n` +
      "usage: VSCE_PAT=... node scripts/marketplace-remove-version.mjs <x.y.z>",
  );
  process.exit(1);
}

const pat = process.env.VSCE_PAT;
if (!pat) {
  console.error("VSCE_PAT is not set (Azure DevOps PAT, scope Marketplace > Manage).");
  process.exit(1);
}

const { publisher, name } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const api = new GalleryApi("https://marketplace.visualstudio.com", [
  getBasicHandler("OAuth", pat),
]);
await api.deleteExtension(publisher, name, version);
console.log(
  `Removed ${publisher}.${name} ${version} from the Marketplace; the previous version is latest again.`,
);
