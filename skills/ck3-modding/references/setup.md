# Mod setup, load order, override rules, directory map

## Mod structure

Mods live in the **user** directory (`<mods>`, see SKILL.md Step 0), not the install:
- Windows: `%USERPROFILE%\Documents\Paradox Interactive\Crusader Kings III\mod\`
  (Documents may be redirected to another drive or OneDrive)
- Linux: `~/.local/share/Paradox Interactive/Crusader Kings III/mod/`

A mod = a **`.mod` metadata file** next to a **mod folder**, plus an identical `descriptor.mod`
*inside* the folder (identical minus the `path` line). Easiest creation: launcher → Mods →
Upload Mod → Create a Mod.

```
# my_mod.mod  (outer file, in .../mod/)
version="0.1"
tags={ "Events" "Gameplay" }
name="My Mod"
supported_version="1.16.*"      # wildcards allowed; launcher warns if outdated
path="mod/my_mod"               # OMIT this line in descriptor.mod
```

Optional keys: `picture` (launcher thumbnail; Steam always uses `thumbnail.png` in the mod folder
instead), `remote_file_id` (Steam Workshop ID, set on upload), `replace_path="history/characters"`
(**suppresses an entire vanilla folder** — the game loads only your version of that path; use for
wholesale replacement, e.g. total-conversion history).

Inside the mod folder, files mirror the game folder structure exactly: `events/`,
`common/decisions/`, `localization/english/`, etc. A typo in a folder name means the file is
**silently ignored**.

## Load order and override rules (critical)

Mods load top→bottom in the playset; on conflict, **the mod lower in the list wins**.
Compatibility patches go last. Two mechanisms:

1. **Full-file override** — a file with the same path+filename as vanilla replaces the entire file.
2. **Single-object override** — put your changed top-level object in a **new** file at the same
   vanilla path. For script, ordering is **ASCIIbetical, Last-In-Only-Served (LIOS)**:
   `zz_my_mod.txt` overrides `00_x.txt`. You can *change* but not *remove* an object this way.
   Put your mod name in the filename so conflicts show up in `database_conflicts.log`.

Per-system behavior:

| System | Behavior |
|---|---|
| Most `common/` script (defines, traits, decisions, scripted effects/triggers/values…) | Single-object override, **LIOS** (last asciibetical file wins). For defines, include the category block: `NCharacter = { BASE_HEALTH = 5.0 }` |
| `on_action` | `events`, `random_events`, `on_actions` sub-blocks **append/merge** across mods; `trigger` and `effect` **overwrite** |
| Events | **Whole-file only** — you cannot override a single vanilla event; replace the whole file (or fire your own via on_action) |
| Faiths, `common/holdings/holdings.txt` | Whole-file only |
| History characters | **Do not override — they duplicate.** Editing a vanilla character requires overriding the whole history file or `replace_path` |
| Localization | Single keys overridable only inside a `replace` folder: `localization/replace/english/` or `localization/english/replace/` |
| GUI types/templates | **FIOS (First-In-Only-Served)** — the *first*-loaded definition wins; name your file to sort first (`00_my_mod.gui`). Opposite of script! `gui/scripted_widgets/` registry files all load additively (see `gui.md`) |

## Launch options

`-debug_mode` (console + debug tooltips; **since 1.9 mods and debug no longer disable
achievements**, but console commands do for that session), `-develop` (hot-reload most script
files on save), `-mapeditor`, `-nographics`, `-random_seed=42`, `-continuelastsave`.
Set via Steam → Properties → Launch Options.

## Compatibility, distribution, achievements

- Ship a **compatch** (loads after both mods) to merge conflicting files. Detect other mods at
  runtime via a global variable or an `always = no` scripted trigger the other mod overrides to `yes`.
- **Steam Workshop**: launcher → Upload Mod (name ≥3 chars, ≥1 tag); uploads private, publish via
  Steam. `thumbnail.png` (1:1, ≤1 MB) in the mod folder. If you subscribe to your own mod, delete
  the local copy — only one may exist.
- Keep `supported_version` current or the launcher flags the mod.
- Mods don't invalidate ironman; checksum (main menu, bottom-right) matters for multiplayer —
  all players need identical mods and load order.

## Game folder directory map

Top level: `common/` (the game database, ~100 subfolders), `events/`, `history/`, `gui/`,
`localization/`, `dlc/` (each DLC is a mini-mod overriding base), `data_binding/`, `fonts/`,
`music/`, `sound/`, `notifications/`, `reader_export/`, `tests/`, `tools/`, `gfx/`, `map_data/`.

### common/ by system

| Group | Folders |
|---|---|
| Characters & traits | `traits`, `nicknames`, `deathreasons`, `ethnicities`, `genes`, `dna_data`, `portrait_types`, `character_backgrounds`, `character_memory_types`, `scripted_character_templates`, `pool_character_selectors` |
| Culture | `culture/` → `cultures`, `pillars`, `traditions`, `innovations`, `eras`, `name_lists`, `name_equivalency`, `creation_names`; also `flavorization` |
| Religion | `religion/` → `religion_types`, `religion_family_types`, `doctrine_types`, `doctrine_group_types`, `holy_site_types` |
| Titles & realm | `landed_titles`, `governments`, `laws`, `succession_election`, `succession_appointment`, `council_positions`, `council_tasks`, `court_positions`, `court_types`, `vassal_stances`, `subject_contracts`, `tax_slots`, `factions`, `legitimacy`, `diarchies` |
| Player actions | `decisions`, `decision_group_types`, `character_interactions`, `activities`, `schemes`, `secret_types`, `hook_types`, `casus_belli_types`, `travel`, `inspirations`, `focuses`, `lifestyles`, `lifestyle_perks` |
| Dynasty & house | `dynasties`, `dynasty_houses`, `dynasty_legacies`, `dynasty_perks`, `house_unities`, `house_aspirations` |
| Military & economy | `men_at_arms_types`, `combat_effects`, `holdings`, `buildings`, `great_projects`, `province_terrain`, `terrain_types`, `raids` |
| DLC-era systems | `situation`, `struggle`, `legends`, `epidemics`, `artifacts`, `accolade_types`, `domiciles`, `confederation_types`, `story_cycles` |
| Scripting primitives | `scripted_effects`, `scripted_triggers`, `script_values`, `scripted_modifiers`, `scripted_rules`, `scripted_lists`, `scripted_guis`, `on_action` (singular!), `customizable_localization`, `effect_localization`, `trigger_localization` |
| Config & UI data | `defines`, `game_rules`, `game_concepts`, `coat_of_arms`, `named_colors`, `modifiers`, `opinion_modifiers`, `messages`, `important_actions`, `suggestions`, `bookmarks`, `event_backgrounds`, `event_themes`, `achievements` |

### Other top-level folders

- `events/` — ~55 thematic files + subfolders (`activities/`, `religion_events/`, `scheme_events/`,
  `war_events/`, `dlc/`, …). Schema: `events/_events.info`.
- `history/` — `characters/`, `titles/`, `provinces/`, `cultures/`, `wars/`, `struggles/`.
  Schemas: `history/_history.info`, `_characters.info`, `_provinces.info`.
- `gui/` — ~200 `window_*.gui`; `gui/shared/` holds reusable templates; `gui/preload/defaults.gui`
  registers the base widget types; `gui/debug/` has the test window and component library (see `gui.md`).
- `localization/` — english, french, german, spanish, russian, polish, korean, japanese,
  simp_chinese (+ shared `jomini/`).
- `reader_export/_reader_export.info` — authoritative doc for the `@` macro/preprocessor language.
- `tests/` — engine self-tests: worked effect/trigger examples with asserts.
- `tools/` — map editor / exporter configs.
