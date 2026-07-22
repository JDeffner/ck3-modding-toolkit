/**
 * GameProfile conformance suite (PLAN.md M2): every registered profile must
 * declare the required identity fields and knowledge tables, and its schema
 * table must pass the structural sanity rules the engine relies on. Runs
 * against ALL profiles so a new game cannot ship a half-declared profile.
 */
import { describe, expect, it } from "vitest";
import { allProfiles, defaultProfile, resolveProfile } from "../src/games/registry";

describe("game profile registry", () => {
  it("resolves ids and falls back to the default", () => {
    expect(defaultProfile.id).toBe("ck3");
    expect(resolveProfile("ck3")).toBe(defaultProfile);
    expect(resolveProfile(undefined)).toBe(defaultProfile);
    expect(resolveProfile("no-such-game")).toBe(defaultProfile);
  });

  it("has unique ids and cache suffixes", () => {
    const ids = allProfiles().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const suffixes = allProfiles().map((p) => p.cacheSuffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});

describe.each(allProfiles().map((p) => [p.id, p] as const))("profile %s", (_id, profile) => {
  it("declares its identity", () => {
    expect(profile.id).toMatch(/^[a-z0-9]+$/);
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.shortName.length).toBeGreaterThan(0);
    expect(["jomini", "clausewitz-classic"]).toContain(profile.engine);
    expect(["mod", "metadata"]).toContain(profile.descriptor);
    expect(profile.configDirName).toMatch(/^\.[a-z0-9]+$/);
    expect(profile.docsFolderName.length).toBeGreaterThan(0);
    expect(profile.steamAppId).toBeGreaterThan(0);
    // Non-default profiles must namespace their caches (shared storageDir).
    if (profile !== defaultProfile) expect(profile.cacheSuffix).toMatch(/^-[a-z0-9]/);
  });

  it("declares a well-formed schema table", () => {
    expect(profile.schema.length).toBeGreaterThan(0);
    const paths = new Set<string>();
    for (const entry of profile.schema) {
      // Folder paths: forward slashes, no leading/trailing slash, no dup.
      expect(entry.path).toMatch(/^[a-z0-9_]+(\/[a-z0-9_]+)*$/);
      expect(paths.has(entry.path), `duplicate schema path ${entry.path}`).toBe(false);
      paths.add(entry.path);
      expect(entry.kind).toMatch(/^[a-z0-9_]+$/);
      if (entry.ext) expect(entry.ext).toMatch(/^\.[a-z0-9]+$/);
      for (const loc of entry.requiredLoc ?? []) expect(loc).toContain("$");
    }
    // Every game must at least index localization keys.
    expect(profile.schema.some((e) => e.kind === "loc_key")).toBe(true);
  });

  it("keeps ref tables consistent with the schema kinds", () => {
    const kinds = new Set(profile.schema.map((e) => e.kind));
    // Kinds that come from reference extraction, not folder scans.
    for (const k of [
      "saved_scope",
      "flag",
      "list",
      "variable",
      "local_variable",
      "global_variable",
      "variable_list",
      "local_variable_list",
      "global_variable_list",
      "character",
      "province",
    ]) {
      kinds.add(k);
    }
    const refKeys = new Set<string>();
    for (const f of profile.refFields) {
      expect(refKeys.has(f.key), `duplicate refField ${f.key}`).toBe(false);
      refKeys.add(f.key);
      expect(f.kinds.length).toBeGreaterThan(0);
    }
    for (const [prefix, prefixKinds] of Object.entries(profile.prefixRefs)) {
      expect(prefix).toMatch(/^[a-z_]+$/);
      expect(prefixKinds.length).toBeGreaterThan(0);
    }
    // Structure/ambient layers may only describe kinds the schema declares.
    for (const entry of profile.schema) {
      if (entry.structure) expect(kinds.has(entry.kind)).toBe(true);
    }
    for (const kind of Object.keys(profile.structureSources)) {
      expect(typeof profile.structureSources[kind]).toBe("string");
    }
  });

  it("declares the engine-facing extras", () => {
    expect(typeof profile.wikiNote).toBe("string");
    expect(profile.diagnosticSource.length).toBeGreaterThan(0);
    expect(profile.modifierPlaceholders).toBeTypeOf("object");
    for (const [name, spec] of Object.entries(profile.modifierPlaceholders)) {
      expect(name).toMatch(/^[A-Z_]+$/);
      expect(spec.label.length).toBeGreaterThan(0);
      // Exactly one expansion source: an index kind or a fixed value set.
      expect(Boolean(spec.kind) !== Boolean(spec.values)).toBe(true);
    }
    if (profile.tiger) {
      expect(profile.tiger.binaryName).toContain("tiger");
      expect(profile.tiger.repoSlug).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(profile.tiger.confName).toMatch(/\.conf$/);
    }
  });
});
