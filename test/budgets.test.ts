import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as path from "path";
import { loadWikiTokens } from "../server/src/data/wikiDocs";
import { ServerData } from "../server/src/serverData";
import { CompletionFeature } from "../server/src/features/completion";
import { loadSchema } from "../server/src/schema/loader";
import { scanRoot } from "../server/src/index/indexer";
import { devPath } from "./devPaths";

const GAME = devPath("gamePath");

/**
 * Performance budgets (rework plan Phase 6). The completion budget runs
 * everywhere (bundled wiki tokens, synthetic document); the cold-scan budget
 * needs the game and is gated on the configured gamePath (see devPaths.ts).
 */

function syntheticEventFile(events: number): string {
  const lines: string[] = ["namespace = bench"];
  for (let i = 1; i <= events; i++) {
    lines.push(
      `bench.${i} = {`,
      "\ttype = character_event",
      `\ttitle = bench.${i}.t`,
      "\timmediate = {",
      "\t\tevery_vassal = {",
      "\t\t\tlimit = { is_adult = yes }",
      "\t\t\tadd_gold = 5",
      "\t\t}",
      "\t}",
      "\toption = {",
      `\t\tname = bench.${i}.a`,
      "\t}",
      "}"
    );
  }
  return lines.join("\n");
}

describe("performance budgets", () => {
  it("completion p95 stays under 100ms on a 2000-line document", () => {
    const data = new ServerData();
    data.setTokens(loadWikiTokens(path.join(__dirname, "..", "wikidocs")));
    expect(data.tokens.length).toBeGreaterThan(500); // sanity: wiki data loaded
    const schema = loadSchema(null);
    const completion = new CompletionFeature(data, () => schema);

    const text = syntheticEventFile(160); // ~2000 lines
    const doc = TextDocument.create("file:///bench/events/bench.txt", "paradox", 1, text);
    const offset = text.indexOf("add_gold");

    const samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      const { items } = completion.provide(doc, offset, new Set(["character"]));
      samples.push(performance.now() - t0);
      expect(items.length).toBeGreaterThan(100);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    // eslint-disable-next-line no-console
    console.log(`completion p95: ${p95.toFixed(1)}ms (min ${samples[0].toFixed(1)}ms)`);
    expect(p95).toBeLessThan(100);
  });

  it.skipIf(!GAME)("cold vanilla scan stays under 60s", () => {
    const t0 = Date.now();
    const defs = scanRoot(GAME!, "vanilla", { locLanguage: "english" });
    const elapsed = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`cold scan: ${elapsed}ms, ${defs.length} definitions`);
    expect(elapsed).toBeLessThan(60_000);
    expect(defs.length).toBeGreaterThan(300_000);
  });
});
