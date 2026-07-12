/**
 * PdxGui language features: property/type completion from the bundled vanilla
 * gui harvest, using= template completion from the index, hover cards.
 */
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { provideGuiCompletion, provideGuiHover } from "../server/src/features/guiLanguage";
import { ServerData } from "../server/src/serverData";

let uriCounter = 0;
const uri = () => `file:///mod/gui/fixture-${uriCounter++}.gui`;

function makeData(): ServerData {
  const data = new ServerData();
  data.index.addAll([
    {
      name: "MyModTemplate",
      kind: "gui_type",
      file: "F:/mod/gui/my_templates.gui",
      line: 3,
      source: "mod",
    },
    {
      name: "Background_Area_Dark",
      kind: "gui_type",
      file: "F:/game/gui/shared.gui",
      line: 10,
      source: "vanilla",
    },
  ]);
  return data;
}

function provideAt(data: ServerData, text: string, marker = "|") {
  const cursor = text.indexOf(marker);
  const clean = text.slice(0, cursor) + text.slice(cursor + marker.length);
  const doc = TextDocument.create(uri(), "paradox-gui", 1, clean);
  return provideGuiCompletion(data, doc, cursor);
}

describe("GUI completion", () => {
  it("inside a widget block: properties of that type lead, from the vanilla harvest", () => {
    const { items } = provideAt(makeData(), "widget = {\n\t|\n}");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("size");
    expect(labels).toContain("name");
    expect(labels).toContain("visible");
    // Properties rank in tier 0, widget types behind them.
    const size = items.find((i) => i.label === "size")!;
    expect(size.sortText!.startsWith("0")).toBe(true);
    expect(size.detail).toContain("property of widget");
  });

  it("inside a flowcontainer: container-specific layout props appear", () => {
    const { items } = provideAt(makeData(), "flowcontainer = {\n\t|\n}");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("direction");
    expect(labels).toContain("margin_left");
  });

  it("offers widget types as children and at top level", () => {
    const inside = provideAt(makeData(), "widget = {\n\t|\n}");
    const flow = inside.items.find((i) => i.label === "flowcontainer");
    expect(flow).toBeDefined();
    expect(flow!.detail).toMatch(/child widget|widget type/);

    const top = provideAt(makeData(), "|");
    const window = top.items.find((i) => i.label === "window");
    expect(window).toBeDefined();
    expect(window!.detail).toContain("widget type");
  });

  it("using = | completes templates, mod first", () => {
    const { items } = provideAt(makeData(), "widget = {\n\tusing = |\n}");
    const labels = items.map((i) => i.label);
    expect(labels).toContain("MyModTemplate");
    expect(labels).toContain("Background_Area_Dark");
    expect(labels.indexOf("MyModTemplate")).toBeLessThan(labels.indexOf("Background_Area_Dark"));
  });

  it("unknown value positions stay quiet (no soup)", () => {
    const { items } = provideAt(makeData(), 'widget = {\n\ttexture = |\n}');
    expect(items).toHaveLength(0);
  });

  it("typed word filters server-side", () => {
    const { items, isIncomplete } = provideAt(makeData(), "widget = {\n\tvis|\n}");
    expect(isIncomplete).toBe(true);
    expect(items.map((i) => i.label)).toContain("visible");
    expect(items.map((i) => i.label)).not.toContain("size");
  });
});

describe("GUI hover", () => {
  it("widget type hover shows usage and common properties", () => {
    const text = "flowcontainer = {\n\tname = \"x\"\n}";
    const doc = TextDocument.create(uri(), "paradox-gui", 1, text);
    const hover = provideGuiHover(makeData(), doc, { line: 0, character: 3 });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("flowcontainer");
    expect(value).toContain("in vanilla gui");
  });

  it("template hover links to its definition", () => {
    const text = "widget = {\n\tusing = MyModTemplate\n}";
    const doc = TextDocument.create(uri(), "paradox-gui", 1, text);
    const hover = provideGuiHover(makeData(), doc, { line: 1, character: 10 });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("MyModTemplate");
    expect(value).toContain("my_templates.gui:4");
  });

  it("property hover names the enclosing type", () => {
    const text = "widget = {\n\tparentanchor = bottom\n}";
    const doc = TextDocument.create(uri(), "paradox-gui", 1, text);
    const hover = provideGuiHover(makeData(), doc, { line: 1, character: 3 });
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("parentanchor");
  });
});
