/**
 * Victoria 3 identity and conventions. Data only — safe for the VSCode
 * client to import without pulling the knowledge tables into its bundle.
 * Preview-quality support (PLAN.md M4): shipped behind a client setting.
 */
import type { GameMeta } from "../profile";

export const vic3Meta: GameMeta = {
  id: "vic3",
  name: "Victoria 3",
  shortName: "Vic3",
  engine: "jomini",
  // Vic3 mods carry .metadata/metadata.json instead of a launcher .mod file.
  descriptor: "metadata",
  configDirName: ".vic3modding",
  docsFolderName: "Victoria 3",
  steamAppId: 529340,
  eventNamespaces: true,
  tiger: { binaryName: "vic3-tiger", repoSlug: "amtep/tiger", confName: "vic3-tiger.conf" },
  cacheSuffix: "-vic3",
};
