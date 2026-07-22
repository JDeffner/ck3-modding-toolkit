/**
 * The Victoria 3 schema table — deliberately small (PLAN.md M4 cut line):
 * the high-traffic script folders whose layout matches the extraction modes,
 * verified against a real Vic3 install. No structure/ambient layers, no
 * requiredLoc claims (nothing measured to the ≥95% bar yet), no gui/wiki/
 * data-type bundles in v1. Engine tokens come from the user's own
 * script_docs logs (same log format as CK3).
 */
import type { SchemaEntry, RefField } from "../../schema/types";
import { JOMINI_VARIABLE_BLOCK_REFS } from "../jomini/variables";

export const VIC3_SCHEMA: SchemaEntry[] = [
  // Events use `namespace = x` declarations and ns.N ids like CK3. Root scope
  // varies by event type (country/state/character), so none is claimed.
  { path: "events", kind: "event", extraction: "event-id" },
  { path: "localization", kind: "loc_key", ext: ".yml", extraction: "loc-key" },
  { path: "common/scripted_effects", kind: "scripted_effect" },
  { path: "common/scripted_triggers", kind: "scripted_trigger" },
  { path: "common/script_values", kind: "script_value" },
  // Vic3 reads the PLURAL folder (unlike CK3's common/on_action).
  { path: "common/on_actions", kind: "on_action" },
  { path: "common/decisions", kind: "decision", rootScopes: ["country"] },
  { path: "common/journal_entries", kind: "journal_entry", rootScopes: ["country"] },
];

/** Assignment keys whose values reference other definitions (minimal v1 set). */
export const VIC3_REF_FIELDS: RefField[] = [
  { key: "trigger_event", kinds: ["event"] },
  { key: "on_action", kinds: ["on_action"] },
  { key: "events", kinds: ["event"], form: "list" },
  { key: "random_events", kinds: ["event"], form: "list" },
];

export const VIC3_BLOCK_REF_FIELDS: Record<string, Record<string, string[]>> = {
  trigger_event: { id: ["event"] },
  ...JOMINI_VARIABLE_BLOCK_REFS,
};
