/**
 * Data types for [ ... ] datafunction expressions: the bundled wiki harvest,
 * the DumpDataTypes log parser, chain resolution, and the completion/hover
 * providers shared by .gui and localization files.
 */
import { describe, expect, it } from "vitest";
import {
  loadBundledDataTypes,
  parseDataTypesDump,
  resolveChainType,
  membersOf,
} from "../server/src/data/dataTypes";
import {
  chainAtEnd,
  datafunctionExprAt,
  openCallAt,
  provideDataFnCompletion,
  provideDataFnHover,
  provideDataFnSignature,
} from "../server/src/features/datafunction";
import { emptyUsage, harvestLine, parseDataFnExpr, type DataFnUsage } from "../server/src/data/dataFnUsage";
import { describeDataFn, CURATED_DOCS } from "../server/src/data/dataFnDocs";

/** Usage fixture built by harvesting a handful of realistic vanilla lines. */
function fixtureUsage(): DataFnUsage {
  const u = emptyUsage();
  const lines = [
    'visible = "[ObjectsEqual( HouseAspiration.Self, HouseAspirationWindow.GetHouseAspiration )]"',
    'datacontext = "[HouseAspirationWindow.GetDynastyHouse.GetHouseAspiration]"',
    "text = \"[Character.GetHouseAspiration('no_aspect').GetName|E]\"",
    "text = \"[Character.GetHouseAspiration('strength').GetName|U]\"",
    'visible = "[And( HouseAspiration.HasMultipleLevels, Not( IsDataModelEmpty( HouseAspiration.GetLevels ) ) )]"',
  ];
  lines.forEach((l, i) => harvestLine(u, l, "gui/test.gui", i + 1));
  return u;
}

describe("bundled wiki data types", () => {
  const data = loadBundledDataTypes();

  it("loads globals and types from shared/data/dataTypes.json", () => {
    expect(data.count).toBeGreaterThan(2000);
    expect(data.globals.get("GetPlayer")?.ret).toBe("Character");
    expect(data.types.has("Character")).toBe(true);
    expect(data.types.has("Title")).toBe(true);
  });

  it("has the everyday Character members with return types", () => {
    const character = data.types.get("Character")!;
    expect(character.get("GetFather")?.ret).toBe("Character");
    expect(character.get("GetFaith")?.ret).toBe("Faith");
    expect(character.get("IsAlive")?.ret).toBe("bool");
    expect(character.has("IsAdult")).toBe(true);
    expect(character.get("GetDomainSize")?.ret).toBe("int32");
    // Known-name members whose return type the wiki does not register still complete:
    expect(character.has("GetName")).toBe(true);
  });
});

describe("DumpDataTypes log parser", () => {
  const DUMP = [
    "GetPlayer",
    "Definition type: Global function",
    "Return type: Character",
    "-----------------------",
    "",
    "Character.IsLandedRuler",
    "Definition type: Function",
    "Return type: bool",
    "-----------------------",
    "",
    "Faith.GetAdherentName( CString )",
    "Definition type: Function",
    "Return type: CString",
    "-----------------------",
    "",
    "ACTIVITY",
    "Definition type: Global promote",
    "Return type: Activity",
    "-----------------------",
    "",
    "Character",
    "Definition type: Type",
    "-----------------------",
    "",
    "SomeMacro",
    "Definition type: Global macro",
    "-----------------------",
  ].join("\n");

  it("parses globals, typed members and argument lists; skips Type/macro entries", () => {
    const data = parseDataTypesDump(DUMP);
    expect(data.count).toBe(4);
    expect(data.globals.get("GetPlayer")).toMatchObject({ ret: "Character", kind: "function" });
    expect(data.globals.get("ACTIVITY")).toMatchObject({ ret: "Activity", kind: "promote" });
    expect(data.types.get("Character")?.get("IsLandedRuler")?.ret).toBe("bool");
    expect(data.types.get("Faith")?.get("GetAdherentName")).toMatchObject({ ret: "CString", args: ["CString"] });
    expect(data.globals.has("SomeMacro")).toBe(false);
  });

  it("merges into the bundled baseline (dump entries win by overwrite)", () => {
    const data = loadBundledDataTypes();
    parseDataTypesDump(DUMP, data);
    expect(data.types.get("Character")?.get("IsLandedRuler")?.ret).toBe("bool");
    // Bundled members survive.
    expect(data.types.get("Character")?.get("GetFather")?.ret).toBe("Character");
  });
});

describe("chain resolution", () => {
  const data = loadBundledDataTypes();

  it("resolves datacontext style (Character.GetFather → Character)", () => {
    expect(resolveChainType(data, ["Character"])).toBe("Character");
    expect(resolveChainType(data, ["Character", "GetFather"])).toBe("Character");
    expect(resolveChainType(data, ["Character", "GetFaith"])).toBe("Faith");
  });

  it("resolves global starts (GetPlayer.GetFather → Character)", () => {
    expect(resolveChainType(data, ["GetPlayer"])).toBe("Character");
    expect(resolveChainType(data, ["GetPlayer", "GetFather"])).toBe("Character");
  });

  it("returns null on unknown segments", () => {
    expect(resolveChainType(data, ["NoSuchThing"])).toBeNull();
    expect(resolveChainType(data, ["Character", "NoSuchMember"])).toBeNull();
  });

  it("membersOf is case-tolerant on the type name", () => {
    expect(membersOf(data, "character")).not.toBeNull();
  });
});

describe("expression detection", () => {
  it("finds the open expression in a line prefix", () => {
    expect(datafunctionExprAt('text = "[Character.')).toBe("Character.");
    expect(datafunctionExprAt('text = "[GetPlayer.GetName] and [Faith.')).toBe("Faith.");
    expect(datafunctionExprAt('text = "[GetPlayer.GetName]"')).toBeNull();
    expect(datafunctionExprAt("plain line")).toBeNull();
  });

  it("extracts the trailing chain, cutting at argument boundaries", () => {
    expect(chainAtEnd("Character.GetFather.")).toEqual(["Character", "GetFather", ""]);
    expect(chainAtEnd("Concat( 'x', Character.Get")).toEqual(["Character", "Get"]);
    expect(chainAtEnd("")).toEqual([""]);
  });
});

describe("datafunction completion", () => {
  const data = loadBundledDataTypes();

  it("chain start offers data types and globals", () => {
    const result = provideDataFnCompletion(data, emptyUsage(), ' my_key:0 "[')!;
    const labels = result.items.map((i) => i.label);
    expect(labels).toContain("Character");
    expect(labels).toContain("GetPlayer");
  });

  it("Character. offers that type's members (IsAlive, IsAdult, GetName…)", () => {
    const result = provideDataFnCompletion(data, emptyUsage(), 'text = "[Character.')!;
    const labels = result.items.map((i) => i.label);
    expect(labels).toContain("IsAlive");
    expect(labels).toContain("IsAdult");
    expect(labels).toContain("GetName");
    expect(labels).not.toContain("GetPlayer"); // globals only at chain start
  });

  it("chains through return types (GetPlayer.GetFaith. → Faith members)", () => {
    const result = provideDataFnCompletion(data, emptyUsage(), '"[GetPlayer.GetFaith.')!;
    const labels = result.items.map((i) => i.label);
    expect(labels).toContain("GetAdjective");
  });

  it("typed word filters members with the client's own predicate", () => {
    const result = provideDataFnCompletion(data, emptyUsage(), '"[Character.IsAl')!;
    const labels = result.items.map((i) => i.label);
    expect(labels).toContain("IsAlive");
    expect(labels).not.toContain("GetFather"); // no i-s-a-l subsequence
  });

  it("returns null outside an expression, empty on unknown owners", () => {
    expect(provideDataFnCompletion(data, emptyUsage(), "desc = my_loc")).toBeNull();
    expect(provideDataFnCompletion(data, emptyUsage(), '"[NoSuchType.')!.items).toEqual([]);
  });
});

describe("datafunction hover", () => {
  const data = loadBundledDataTypes();

  it("member segment shows owner, kind and return type", () => {
    const line = ' key:0 "Hello [Character.GetFather.GetDread]!"';
    const hover = provideDataFnHover(data, emptyUsage(), line, line.indexOf("GetDread") + 2)!;
    expect(hover.markdown).toContain("Character.GetDread");
    expect(hover.markdown).toContain("CFixedPoint");
    expect(line.slice(hover.start, hover.end)).toBe("GetDread");
  });

  it("chain-start segment shows the data type or global", () => {
    const line = 'text = "[Character.IsAlive]"';
    const typeHover = provideDataFnHover(data, emptyUsage(), line, line.indexOf("Character") + 1)!;
    expect(typeHover.markdown).toContain("data type");
    const memberHover = provideDataFnHover(data, emptyUsage(), line, line.indexOf("IsAlive") + 1)!;
    expect(memberHover.markdown).toContain("bool");
  });

  it("stays quiet outside expressions and on unknown names", () => {
    const line = "some_key: \"plain text\"";
    expect(provideDataFnHover(data, emptyUsage(), line, 5)).toBeNull();
    const unknown = 'x = "[Bogus.Chain]"';
    expect(provideDataFnHover(data, emptyUsage(), unknown, unknown.indexOf("Chain") + 1)).toBeNull();
  });
});

describe("vanilla usage harvest", () => {
  const usage = fixtureUsage();

  it("parses expressions: chains, nested calls, literals, format suffix", () => {
    const parsed = parseDataFnExpr("ObjectsEqual( GetHouseAspiration('no_aspect'), HouseAspiration.Self )")!;
    expect(parsed.chain[0].name).toBe("ObjectsEqual");
    expect(parsed.chain[0].args).toHaveLength(2);
    const fmt = parseDataFnExpr("Character.GetName|U")!;
    expect(fmt.format).toBe("U");
    expect(parseDataFnExpr("not an expression!")).toBeNull();
  });

  it("records starts, pairs, member pool, arities and literals", () => {
    expect(usage.starts.get("HouseAspiration")).toBeGreaterThan(0);
    expect(usage.starts.get("HouseAspirationWindow")).toBeGreaterThan(0);
    expect(usage.pairs.get("HouseAspiration")?.get("Self")).toBeGreaterThan(0);
    expect(usage.memberPool.get("GetHouseAspiration")).toBeGreaterThan(0);
    expect(usage.argCounts.get("ObjectsEqual")?.get(2)).toBe(1);
    expect(usage.literals.get("GetHouseAspiration")?.get("no_aspect")).toBe(1);
    expect(usage.formats.get("E")).toBe(1);
    expect(usage.examples.get("GetHouseAspiration")![0].file).toBe("gui/test.gui");
  });

  it("skips loc-escaped brackets and lowercase scope starts as chain starts", () => {
    const u = emptyUsage();
    harvestLine(u, ' k:0 "literal \\[Not.An.Expr] and [owner.GetName]"', "f.yml", 1);
    expect(u.starts.has("Not")).toBe(false);
    expect(u.starts.has("owner")).toBe(false);
    expect(u.memberPool.get("GetName")).toBe(1);
  });
});

describe("openCallAt", () => {
  it("finds the innermost open call and active argument", () => {
    expect(openCallAt("ObjectsEqual( GetHouseAspiration('no_aspect'), HouseAsp")).toMatchObject({
      chain: ["ObjectsEqual"],
      argIndex: 1,
      literalPrefix: null,
    });
    expect(openCallAt("Character.GetHouseAspiration('no_as")).toMatchObject({
      chain: ["Character", "GetHouseAspiration"],
      argIndex: 0,
      literalPrefix: "no_as",
    });
    expect(openCallAt("Character.GetName")).toBeNull();
    expect(openCallAt("Concat( 'a', 'b' )")).toBeNull(); // closed
  });
});

describe("usage-aware completion", () => {
  const data = loadBundledDataTypes();
  const usage = fixtureUsage();

  it("offers harvested chain starts unknown to the tables", () => {
    const result = provideDataFnCompletion(data, usage, 'visible = "[HouseAsp')!;
    const labels = result.items.map((i) => i.label);
    expect(labels).toContain("HouseAspiration");
    expect(labels).toContain("HouseAspirationWindow");
  });

  it("offers harvested members on a harvested type", () => {
    const result = provideDataFnCompletion(data, usage, 'visible = "[HouseAspiration.')!;
    const labels = result.items.map((i) => i.label);
    expect(labels).toContain("Self");
    expect(labels).toContain("HasMultipleLevels");
  });

  it("falls back to the member pool when the chain cannot be resolved", () => {
    const result = provideDataFnCompletion(data, usage, '"[HouseAspirationWindow.GetDynastyHouse.')!;
    const labels = result.items.map((i) => i.label);
    expect(labels).toContain("GetHouseAspiration");
  });

  it("completes observed literal arguments inside quotes", () => {
    const result = provideDataFnCompletion(data, usage, "text = \"[Character.GetHouseAspiration('")!;
    const labels = result.items.map((i) => i.label);
    expect(labels).toContain("no_aspect");
    expect(labels).toContain("strength");
  });

  it("completes format suffixes after |", () => {
    const u = fixtureUsage();
    // Push |E over the >=3 uses threshold.
    harvestLine(u, 'a = "[Character.GetName|E]" b = "[Character.GetName|E]"', "f.gui", 1);
    const result = provideDataFnCompletion(data, u, 'text = "[Character.GetName|')!;
    expect(result.items.map((i) => i.label)).toContain("E");
  });

  it("annotates harvested-only names as vanilla usage", () => {
    const result = provideDataFnCompletion(data, usage, 'visible = "[HouseAspiration.')!;
    const self = result.items.find((i) => i.label === "Self")!;
    expect(self.detail).toContain("vanilla usage");
  });
});

describe("usage-aware hover", () => {
  const data = loadBundledDataTypes();
  const usage = fixtureUsage();

  it("covers names the tables do not know, with examples and deduced description", () => {
    const line = 'datacontext = "[HouseAspirationWindow.GetHouseAspiration]"';
    const hover = provideDataFnHover(data, usage, line, line.indexOf("GetHouseAspiration") + 3)!;
    expect(hover.markdown).toContain("vanilla usage");
    expect(hover.markdown).toContain("Returns the house aspiration");
    expect(hover.markdown).toContain("gui/test.gui");
    expect(hover.markdown).toContain("no_aspect");
  });

  it("links examples into the game folder when a root is known", () => {
    const line = 'x = "[HouseAspiration.Self]"';
    const hover = provideDataFnHover(data, usage, line, line.indexOf("HouseAspiration") + 2, "F:\game")!;
    expect(hover.markdown).toContain("file://");
  });
});

describe("datafunction signature help", () => {
  const data = loadBundledDataTypes();
  const usage = fixtureUsage();

  it("uses dump/wiki args when known, highlighting the active parameter", () => {
    const dumped = parseDataTypesDump(
      ["ObjectsEqual( CObject, CObject )", "Definition type: Global function", "Return type: bool", "----"].join("\n"),
      loadBundledDataTypes()
    );
    const line = 'visible = "[ObjectsEqual( HouseAspiration.Self, HouseAsp';
    const help = provideDataFnSignature(dumped, usage, line, line.length)!;
    expect(help.signatures[0].label).toContain("ObjectsEqual( CObject, CObject )");
    expect(help.activeParameter).toBe(1);
  });

  it("falls back to the observed vanilla arity", () => {
    const line = 'text = "[Character.GetHouseAspiration(';
    const help = provideDataFnSignature(data, usage, line, line.length)!;
    expect(help.signatures[0].label).toContain("GetHouseAspiration( arg1 )");
    expect(help.signatures[0].documentation).toContain("no_aspect");
  });

  it("stays quiet outside calls", () => {
    const line = 'text = "[Character.GetName';
    expect(provideDataFnSignature(data, usage, line, line.length)).toBeNull();
  });
});

describe("deduced descriptions", () => {
  it("curates the ubiquitous utilities and deduces the rest from the name", () => {
    expect(CURATED_DOCS.get("ObjectsEqual")).toContain("same game object");
    expect(describeDataFn("GetHouseAspiration", null)).toContain("Returns the house aspiration");
    expect(describeDataFn("HasMultipleLevels", null)).toContain("boolean");
    expect(describeDataFn("OnClick", null)).toContain("Command");
    expect(describeDataFn("EqualTo_int32", null)).toContain("equal");
    expect(describeDataFn("ROOT", null)).toContain("Context promote");
    expect(describeDataFn("Self", null)).toBeNull(); // single word, no head verb: stay honest
  });
});
