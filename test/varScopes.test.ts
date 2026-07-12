/**
 * 2026-07 scope/variable audit fixes: dot-chains through scope:/var: prefixes,
 * iterator false-friends (random_list), prev-as-pop, math-key transparency,
 * data links with arguments, per-definition root scopes (event `scope = X`,
 * on_action expected scopes, `@scope` tags, structure key scopes), variable
 * namespaces (var/local_var/global_var + lists), save_scope_value_as, variable
 * value types, scripted-list iterators.
 */
import { describe, expect, it } from "vitest";
import { parseScript } from "../server/src/parser";
import { ScopeModel } from "../server/src/scopes/model";
import { collectSavedScopeTypes, inferScopeAt, type InferenceContext } from "../server/src/scopes/inference";
import { buildVariableTypes, resolveValueExpr } from "../server/src/scopes/varTypes";
import { extractReferences } from "../server/src/index/references";
import { loadSchema } from "../server/src/schema/loader";
import type { Ck3SchemaEntry } from "../shared/src/schema/types";
import type { Definition, TokenData } from "../shared/src/types";

const TOKENS: TokenData[] = [
  { name: "liege", kind: "event_target", doc: "", scopes: ["input: character", "output: character"] },
  { name: "primary_title", kind: "event_target", doc: "", scopes: ["input: character", "output: landed_title"] },
  { name: "holder", kind: "event_target", doc: "", scopes: ["input: landed_title", "output: character"] },
  { name: "culture", kind: "event_target", doc: "", scopes: ["input: character", "output: culture"] },
  { name: "title", kind: "event_target", doc: "", scopes: ["output: landed_title"] },
  { name: "value", kind: "event_target", doc: "", scopes: ["output: value"] },
  {
    name: "every_held_title",
    kind: "effect",
    doc: "",
    scopes: ["character"],
    traits: "Supported Targets: landed_title",
  },
  { name: "random_list", kind: "effect", doc: "", scopes: ["none"] },
];

const model = new ScopeModel(TOKENS);
const CHARACTER = new Set(["character"]);

function scopesAt(
  snippet: string,
  rootScopes: Set<string> | null = CHARACTER,
  ctx?: InferenceContext
): string[] | null {
  const offset = snippet.indexOf("|");
  if (offset < 0) throw new Error("snippet needs a | marker");
  const text = snippet.replace("|", "");
  const parse = parseScript(text);
  const saved = collectSavedScopeTypes(parse, model, rootScopes, ctx?.entry?.ambientScopes, ctx);
  const result = inferScopeAt(parse, offset, model, rootScopes, saved, ctx);
  return result.scopes ? [...result.scopes].sort() : null;
}

describe("inference: dot-chains through prefixes", () => {
  it("scope:x.link folds the saved scope THEN the link", () => {
    const text =
      "e = {\n\tevery_held_title = { save_scope_as = the_title }\n\tscope:the_title.holder = {\n\t\t|\n\t}\n}";
    expect(scopesAt(text)).toEqual(["character"]);
  });

  it("scope:x.link.link chains fully", () => {
    const text =
      "e = {\n\tliege = { save_scope_as = big }\n\tscope:big.primary_title.holder = {\n\t\t|\n\t}\n}";
    expect(scopesAt(text)).toEqual(["character"]);
  });
});

describe("inference: iterator false-friends and math keys", () => {
  it("random_list keeps the scope (weighted wrapper, not a list iterator)", () => {
    expect(scopesAt("e = {\n\trandom_list = {\n\t\t10 = {\n\t\t\t|\n\t\t}\n\t}\n}")).toEqual(["character"]);
  });

  it("random_valid keeps the scope", () => {
    expect(scopesAt("e = {\n\trandom_valid = {\n\t\t|\n\t}\n}")).toEqual(["character"]);
  });

  it("in-list iterators are unknown (item type unknowable)", () => {
    expect(scopesAt("e = {\n\tevery_in_list = {\n\t\t|\n\t}\n}")).toBeNull();
  });

  it("`value` as a block key is math, not the value link", () => {
    expect(scopesAt("e = {\n\tsome_value = {\n\t\tvalue = {\n\t\t\t|\n\t\t}\n\t}\n}")).toEqual(["character"]);
  });
});

describe("inference: prev pops the scope stack", () => {
  it("prev.prev walks two levels back", () => {
    const text = "e = {\n\tprimary_title = {\n\t\tholder = {\n\t\t\tprev.prev = {\n\t\t\t\t|\n\t\t\t}\n\t\t}\n\t}\n}";
    expect(scopesAt(text)).toEqual(["character"]);
  });
});

describe("inference: data links with arguments", () => {
  it("culture:czech produces culture scope", () => {
    expect(scopesAt("e = {\n\tculture:czech = {\n\t\t|\n\t}\n}")).toEqual(["culture"]);
  });

  it("title:k_france.holder chains to character", () => {
    expect(scopesAt("e = {\n\ttitle:k_france.holder = {\n\t\t|\n\t}\n}")).toEqual(["character"]);
  });
});

describe("inference: per-definition root scopes", () => {
  it("event `scope = X` overrides the character default", () => {
    const entry = { path: "events", kind: "event" } as Ck3SchemaEntry;
    const text = "my.1 = {\n\tscope = artifact\n\timmediate = {\n\t\t|\n\t}\n}";
    expect(scopesAt(text, CHARACTER, { entry })).toEqual(["artifact"]);
  });

  it("events without scope= keep the character default", () => {
    const entry = { path: "events", kind: "event" } as Ck3SchemaEntry;
    expect(scopesAt("my.1 = {\n\timmediate = {\n\t\t|\n\t}\n}", CHARACTER, { entry })).toEqual(["character"]);
  });

  it("on_action roots come from on_actions.log expected scopes", () => {
    const entry = { path: "common/on_action", kind: "on_action" } as Ck3SchemaEntry;
    const ctx: InferenceContext = { entry, onActionScopes: new Map([["on_my_death", "character"]]) };
    expect(scopesAt("on_my_death = {\n\teffect = {\n\t\t|\n\t}\n}", null, ctx)).toEqual(["character"]);
  });

  it("scripted_effect roots come from the @scope doc tag", () => {
    const entry = { path: "common/scripted_effects", kind: "scripted_effect" } as Ck3SchemaEntry;
    const ctx: InferenceContext = {
      entry,
      defScopeTag: (name) => (name === "my_effect" ? new Set(["province"]) : null),
    };
    expect(scopesAt("my_effect = {\n\t|\n}", null, ctx)).toEqual(["province"]);
  });

  it("structure keys with a documented scope set the block root", () => {
    const entry = {
      path: "common/activities/activity_types",
      kind: "activity_type",
      rootScopes: ["character"],
      structure: { topLevel: [{ key: "is_valid", scope: "activity" }] },
    } as Ck3SchemaEntry;
    expect(scopesAt("act = {\n\tis_valid = {\n\t\t|\n\t}\n}", CHARACTER, { entry })).toEqual(["activity"]);
  });
});

describe("inference: variable value types", () => {
  it("var:x resolves through ctx.varTypes", () => {
    const ctx: InferenceContext = { varTypes: new Map([["var:her", new Set(["character"])]]) };
    expect(scopesAt("e = {\n\tvar:her = {\n\t\t|\n\t}\n}", CHARACTER, ctx)).toEqual(["character"]);
  });

  it("var:x.link chains from the variable's type", () => {
    const ctx: InferenceContext = { varTypes: new Map([["var:her", new Set(["character"])]]) };
    expect(scopesAt("e = {\n\tvar:her.primary_title = {\n\t\t|\n\t}\n}", CHARACTER, ctx)).toEqual(["landed_title"]);
  });

  it("untyped var:x stays unknown", () => {
    expect(scopesAt("e = {\n\tvar:mystery = {\n\t\t|\n\t}\n}")).toBeNull();
  });
});

describe("collectSavedScopeTypes: save_scope_value_as", () => {
  it("types value/boolean/flag saves", () => {
    const text = [
      "e = {",
      "\tsave_scope_value_as = { name = my_num value = 5 }",
      "\tsave_scope_value_as = { name = my_bool value = yes }",
      "\tsave_scope_value_as = { name = my_flag value = flag:hello }",
      "}",
    ].join("\n");
    const saved = collectSavedScopeTypes(parseScript(text), model, CHARACTER);
    expect(saved.get("my_num")).toEqual(new Set(["value"]));
    expect(saved.get("my_bool")).toEqual(new Set(["boolean"]));
    expect(saved.get("my_flag")).toEqual(new Set(["flag"]));
  });

  it("saves inside scope:ambient blocks resolve through the ambient seed", () => {
    const text = "e = {\n\tscope:actor = {\n\t\tliege = { save_scope_as = boss }\n\t}\n}";
    const ambient = [{ name: "actor", type: "character" }];
    const saved = collectSavedScopeTypes(parseScript(text), model, null, ambient);
    expect(saved.get("boss")).toEqual(new Set(["character"]));
  });
});

describe("scripted-list iterators", () => {
  it("resolves every_<list> through the list's base, transitively", () => {
    const m = new ScopeModel(TOKENS);
    m.setScriptedLists([
      { name: "held_county", base: "held_title" },
      { name: "coastal_held_county", base: "held_county" },
    ]);
    expect(m.outputOf("every_held_county")).toEqual(new Set(["landed_title"]));
    expect(m.outputOf("random_coastal_held_county")).toEqual(new Set(["landed_title"]));
  });

  it("re-applying replaces the previous scripted-list set", () => {
    const m = new ScopeModel(TOKENS);
    m.setScriptedLists([{ name: "held_county", base: "held_title" }]);
    m.setScriptedLists([]);
    expect(m.outputOf("every_held_county")).toBeNull();
  });
});

describe("variable value-type resolution (varTypes)", () => {
  const noRoot = () => null;
  const charRoot = () => new Set(["character"]);

  it("resolves literals, flags and global link chains", () => {
    expect(resolveValueExpr("5", "f.txt", model, noRoot)).toEqual(new Set(["value"]));
    expect(resolveValueExpr("yes", "f.txt", model, noRoot)).toEqual(new Set(["boolean"]));
    expect(resolveValueExpr("flag:hi", "f.txt", model, noRoot)).toEqual(new Set(["flag"]));
    expect(resolveValueExpr("title:k_france.holder", "f.txt", model, noRoot)).toEqual(new Set(["character"]));
  });

  it("resolves root-anchored chains through the set-file's root scope", () => {
    expect(resolveValueExpr("root.primary_title", "f.txt", model, charRoot)).toEqual(new Set(["landed_title"]));
  });

  it("runtime anchors stay unknown", () => {
    expect(resolveValueExpr("scope:someone", "f.txt", model, noRoot)).toBeNull();
    expect(resolveValueExpr("this", "f.txt", model, noRoot)).toBeNull();
  });

  it("merges set-sites per namespace and keys lists separately", () => {
    const defs: Definition[] = [
      { name: "who", kind: "variable", file: "a.txt", line: 0, source: "mod", value: "title:k_x.holder" },
      { name: "who", kind: "variable", file: "b.txt", line: 0, source: "mod", value: "title:k_y" },
      { name: "who", kind: "local_variable", file: "c.txt", line: 0, source: "mod", value: "5" },
      { name: "crew", kind: "variable_list", file: "d.txt", line: 0, source: "mod", value: "title:k_x.holder" },
    ];
    const info = buildVariableTypes(defs, model, noRoot);
    expect(info.types.get("var:who")).toEqual(new Set(["character", "landed_title"]));
    expect(info.types.get("local_var:who")).toEqual(new Set(["value"]));
    expect(info.listItemTypes.get("var:crew")).toEqual(new Set(["character"]));
  });
});

describe("reference extraction: variable namespaces", () => {
  const schema = loadSchema(process.cwd());

  function extract(text: string) {
    return extractReferences(text, "f:/mod/common/scripted_effects/x.txt", "mod", schema);
  }

  it("splits set-sites by storage class and captures the value expression", () => {
    const { implicitDefs } = extract(
      [
        "eff = {",
        "\tset_variable = { name = a value = liege }",
        "\tset_local_variable = { name = b value = 5 }",
        "\tset_global_variable = { name = c value = yes }",
        "}",
      ].join("\n")
    );
    const byName = new Map(implicitDefs.map((d) => [d.name, d]));
    expect(byName.get("a")?.kind).toBe("variable");
    expect(byName.get("a")?.value).toBe("liege");
    expect(byName.get("b")?.kind).toBe("local_variable");
    expect(byName.get("c")?.kind).toBe("global_variable");
  });

  it("dual-indexes variable lists (list kind carries the item expr)", () => {
    const { implicitDefs } = extract("eff = {\n\tadd_to_variable_list = { name = crew target = liege }\n}");
    const kinds = implicitDefs.filter((d) => d.name === "crew").map((d) => d.kind);
    expect(kinds.sort()).toEqual(["variable", "variable_list"]);
    const listDef = implicitDefs.find((d) => d.kind === "variable_list");
    expect(listDef?.value).toBe("liege");
    const baseDef = implicitDefs.find((d) => d.kind === "variable");
    expect(baseDef?.value).toBeUndefined();
  });

  it("indexes save_scope_value_as as a saved_scope definition", () => {
    const { implicitDefs } = extract("eff = {\n\tsave_scope_value_as = { name = wealth value = 42 }\n}");
    const def = implicitDefs.find((d) => d.name === "wealth");
    expect(def?.kind).toBe("saved_scope");
    expect(def?.value).toBe("42");
  });

  it("variable reads reference the right namespaces", () => {
    const { references } = extract(
      [
        "eff = {",
        "\thas_variable = a",
        "\thas_local_variable = b",
        "\tis_target_in_variable_list = { name = crew target = root }",
        "\tevery_in_list = {",
        "\t\tvariable = crew",
        "\t}",
        "}",
      ].join("\n")
    );
    const byName = new Map(references.map((r) => [r.name, r.kinds]));
    expect(byName.get("a")).toEqual(["variable", "variable_list"]);
    expect(byName.get("b")).toEqual(["local_variable", "local_variable_list"]);
    expect(byName.get("crew")).toEqual(["variable_list"]);
  });

  it("var prefixes reference their own storage class", () => {
    const { references } = extract("eff = {\n\ttrigger = { var:a > local_var:b }\n}");
    const byName = new Map(references.map((r) => [r.name, r.kinds]));
    expect(byName.get("a")).toEqual(["variable", "variable_list"]);
    expect(byName.get("b")).toEqual(["local_variable", "local_variable_list"]);
  });
});
