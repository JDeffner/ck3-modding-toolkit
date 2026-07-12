import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadTokenData, loadTokenDataFromLogs, parseLog } from "../server/src/data/docsParser";

const FIXTURE_LOGS = path.join(__dirname, "fixtures", "logs");

describe("parseLog", () => {
  it("parses effects.log entries with docs and scopes", () => {
    const tokens = parseLog(fs.readFileSync(path.join(FIXTURE_LOGS, "effects.log"), "utf8"), "effect");
    expect(tokens).toHaveLength(4);
    const addGold = tokens.find((t) => t.name === "add_gold");
    expect(addGold).toBeDefined();
    expect(addGold!.kind).toBe("effect");
    expect(addGold!.doc).not.toBe("");
    expect(addGold!.scopes).toEqual(["character"]);
  });

  it("keeps multi-line descriptions and records targets as traits", () => {
    const tokens = parseLog(fs.readFileSync(path.join(FIXTURE_LOGS, "effects.log"), "utf8"), "effect");
    const setRelation = tokens.find((t) => t.name === "set_relation")!;
    expect(setRelation.doc).toContain("scripted relations database");
    expect(setRelation.traits).toContain("Supported Targets: character");
  });

  it("parses event_targets input/output scopes", () => {
    const tokens = parseLog(fs.readFileSync(path.join(FIXTURE_LOGS, "event_targets.log"), "utf8"), "event_target");
    const culture = tokens.find((t) => t.name === "culture")!;
    expect(culture.scopes).toContain("input: character");
    expect(culture.scopes).toContain("output: culture");
  });

  it("parses both modifiers.log styles and skips the preamble", () => {
    const tokens = parseLog(fs.readFileSync(path.join(FIXTURE_LOGS, "modifiers.log"), "utf8"), "modifier");
    expect(tokens.map((t) => t.name)).toEqual(["monthly_income", "diplomacy", "development_growth_factor"]);
    expect(tokens[0].traits).toContain("Categories: character");
  });

  it("does not crash on unknown lines; they land in doc", () => {
    const tokens = parseLog("----\nweird_token - desc\nSome ODD metadata nobody expects\n", "trigger");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].doc).toContain("ODD metadata");
  });
});

describe("loadTokenData caching", () => {
  it("uses the cache when mtimes are unchanged and re-parses on force", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ck3-docs-"));
    const cacheFile = path.join(tmp, "cache", "docsCache.json");

    const first = loadTokenData(FIXTURE_LOGS, cacheFile);
    expect(first.fromCache).toBe(false);
    expect(first.tokens.length).toBeGreaterThan(0);

    const second = loadTokenData(FIXTURE_LOGS, cacheFile);
    expect(second.fromCache).toBe(true);
    expect(second.tokens.length).toBe(first.tokens.length);

    const forced = loadTokenData(FIXTURE_LOGS, cacheFile, true);
    expect(forced.fromCache).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("reports missing log files without failing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ck3-empty-"));
    const result = loadTokenDataFromLogs(tmp);
    expect(result.tokens).toEqual([]);
    expect(result.missing).toHaveLength(4);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
