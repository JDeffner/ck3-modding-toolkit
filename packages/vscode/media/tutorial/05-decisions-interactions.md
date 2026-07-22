# Chapter 5: Decisions and character interactions

Chapter 2 built a decision by copying a shape. This chapter gives you the full schema, then moves to the other big player-action system: character interactions, the right-click menu on a portrait. Interactions are where CK3's AI craft lives, so we spend real time on `ai_accept`.

Schemas: `common/decisions/_decisions.info` and `common/character_interactions/_character_interactions.info`. Both are unusually well commented; the interaction one documents every key and all scope rules.

## Decisions: the full picture

```
chron_grand_archive_decision = {
	picture = {
		trigger = { faith = { has_doctrine = doctrine_theocracy_temporal } }
		reference = "gfx/interface/illustrations/decisions/tgp_scholars.dds"
	}
	picture = {
		reference = "gfx/interface/illustrations/decisions/decision_misc.dds"
	}
	decision_group_type = major
	sort_order = 50

	desc = chron_grand_archive_decision_desc

	is_shown = {
		is_ruler = yes
		is_landed = yes
	}
	is_valid_showing_failures_only = {
		is_available_adult = yes           # not imprisoned, not incapable, adult
	}
	is_valid = {
		gold >= 300
		learning >= 12
	}

	cost = { gold = 300 }
	cooldown = { years = 20 }

	effect = {
		add_prestige = 500
		set_variable = chron_has_archive
	}

	ai_check_interval = 120
	ai_potential = { is_at_war = no }
	ai_will_do = {
		base = 10
		modifier = {
			add = 30
			has_trait = scholar
		}
	}
}
```

The parts Chapter 2 skipped:

- **Multiple `picture` blocks**: the first whose `trigger` passes is used; a triggerless one is the fallback. Vanilla uses this for cultural variants of the same decision.
- **`decision_group_type`** files the decision under a foldable group in the UI. Vanilla groups include `major`, `realm`, `courtier`, `adventurer`, `struggle` and the default `decisions` (see `common/decision_group_types/`).
- **`sort_order`**: higher sorts first within the group.
- **The three validity blocks** differ only in presentation. `is_shown` hides the decision entirely. `is_valid_showing_failures_only` puts failed conditions in the confirm button tooltip. `is_valid` lists them under Requirements in the detail view. All must pass to take the decision.
- **AI**: `ai_check_interval` (months between AI evaluations) must be set unless you use `ai_goal = yes`, which makes the AI budget for the decision like a major expense (reserve `ai_goal` for genuinely expensive strategic decisions; it costs more performance than a high interval). `ai_potential` is the cheap filter; `ai_will_do` is the percent chance once eligible.
- **Custom widgets**: a decision can embed a GUI widget (`widget = { gui = ... controller = decision_option_list_controller item = { ... } }`) to offer a pick-one list inside the decision window. Look at vanilla's `recruit_court_position_decision` in `common/decisions/90_minor_decisions.txt` for a complete worked example.
- Loc keys are derived from the id (`<id>`, `<id>_desc`, `<id>_tooltip`, `<id>_confirm`), each overridable via `title`, `desc`, `selection_tooltip`, `confirm_text`. All four accept dynamic description blocks (`first_valid`), just like events.

Testing tip: `effect remove_decision_cooldown = chron_grand_archive_decision` in the console resets the cooldown between tests.

## Character interactions

An interaction is an action one character performs on another: right-click a portrait, pick from the menu. The system provides two scopes automatically: **`scope:actor`** (who acts) and **`scope:recipient`** (the target). There is **no `root`** in interaction blocks; this surprises everyone once.

A complete, realistic skeleton (keys in the order major mods use them):

```
# common/character_interactions/chron_interactions.txt
chron_request_patronage_interaction = {
	category = interaction_category_diplomacy
	desc = chron_request_patronage_interaction_desc

	is_shown = {
		# cheap gate: runs every time a menu opens, keep it light
		scope:actor = { has_variable = chron_has_archive }
		scope:recipient = { is_ruler = yes }
		NOT = { scope:actor = scope:recipient }
	}

	is_valid_showing_failures_only = {
		scope:recipient = { gold >= 100 }
	}

	cooldown = { years = 5 }

	send_option = {
		flag = chron_dedicate_chapter
		localization = CHRON_DEDICATE_CHAPTER
	}

	on_accept = {
		scope:actor = { add_gold = 100 }
		scope:recipient = {
			add_prestige = 100
			if = {
				limit = { scope:chron_dedicate_chapter = yes }
				add_prestige = 50
			}
		}
	}
	on_decline = {
		scope:actor = {
			add_opinion = {
				target = scope:recipient
				modifier = insulted_opinion
			}
		}
	}

	ai_accept = {
		base = -20
		modifier = {
			add = { value = scope:recipient.ai_greed multiply = -0.25 }
			desc = CHRON_AI_GREED_REASON
		}
		modifier = {
			add = 40
			scope:recipient = { has_trait = ambitious }
			desc = CHRON_AI_AMBITIOUS_REASON
		}
		opinion_modifier = {
			who = scope:recipient
			opinion_target = scope:actor
			multiplier = 0.5
			desc = AI_OPINION_REASON
		}
	}

	ai_potential = {
		scope:actor = { has_variable = chron_has_archive }
	}
	ai_will_do = { base = 20 }
	ai_frequency = 24
	ai_targets = {
		ai_recipients = neighboring_rulers
		max = 3
	}
}
```

What each piece does:

- **`category`** places it in the right-click menu section (diplomacy, hostile, friendly, religion...; see `common/character_interactions/` for the vanilla categories in use).
- **`is_shown`** runs every time a player opens a character's interaction menu, so keep it cheap. Expensive checks belong in `is_valid_showing_failures_only`.
- **`send_option`** adds a checkbox to the interaction window; the chosen state arrives in `on_accept` as `scope:<flag> = yes`. This is the most common way complex interactions offer variations without multiplying interactions.
- **`on_accept` / `on_decline` / `on_send`** are the effect hooks. `auto_accept = yes` (or a trigger block) skips the recipient's choice entirely.
- **`ai_accept`** decides whether an AI recipient says yes: a `base` plus weighted `modifier` blocks, exactly like `ai_chance`, plus the interaction-specific `opinion_modifier` (scales with the recipient's opinion of the actor).
- **`ai_targets` + `max`**: when the AI *initiates* the interaction, this defines who it considers. **Always set `max`** on AI-offered interactions; an unbounded target search across the world is a known performance killer. `ai_frequency` (months) paces how often the AI looks.

### The craft of `ai_accept`

Two techniques separate professional interactions from flat ones, both visible in the biggest published mods:

1. **Give every modifier its own `desc`.** The recipient's answer tooltip then reads like the character reasoning ("As a man of ambition, a famous chronicle tempts me..."), because each weighted reason renders with its text. An `ai_accept` without descs shows bare numbers.
2. **Scale with AI personality attributes, not trait lists.** Every character has hidden AI attributes derived from personality: `ai_honor`, `ai_greed`, `ai_zeal`, `ai_boldness`, `ai_vengefulness`, `ai_sociability`, `ai_energy`, `ai_compassion`, each roughly -100 to 100. `add = { value = scope:recipient.ai_honor divide = 2 }` gives smooth, personality-driven variance where a `has_trait` ladder gives three hard steps. Use trait checks for flavor spikes, attributes for the baseline.

### Retargeting with `redirect`

Sometimes an interaction clicked on one character should actually resolve against another ("petition the liege about this vassal"). The `redirect` block re-targets before any checks run:

```
	redirect = {
		scope:recipient = {
			save_scope_as = secondary_recipient
			scope:actor.top_liege = { save_scope_as = recipient }
		}
	}
```

After this, `scope:recipient` is the liege and the original click target is `scope:secondary_recipient`. Secondary scopes otherwise exist only when the interaction declares them (for example `secondary_recipient = marriage` in marriage-type interactions).

### Duels: visible-odds gambles

Options and `on_accept` blocks can contain a `duel`, a skill-contested random outcome with odds shown to the player:

```
	duel = {
		skill = diplomacy
		target = scope:recipient
		50 = {
			desc = chron_duel_success
			compare_modifier = {
				value = scope:duel_value
				multiplier = 3.5
				min = -49
			}
			add_gold = 200
		}
		50 = {
			desc = chron_duel_failure
			add_prestige = -50
		}
	}
```

The engine computes `scope:duel_value` from the two characters' skill difference; `compare_modifier` folds it into the weights, and the UI shows the resulting chances. Free drama with fair, legible odds. Vanilla's `events/tutorial_events.txt` contains this exact shape.

## Decision or interaction or event?

A rule of thumb for choosing the vehicle:

- **Decision**: self-targeted, deliberate, usually rare or strategic. The player seeks it out.
- **Interaction**: character-to-character, immediate, repeatable. The player (or AI) does it *to someone*.
- **Event**: happens *to* the player, on the game's initiative (via on_action, story cycle or another event).

Most mid-size features want one of each: a decision to opt in, events for the ongoing texture, an interaction for the character-to-character verbs.

## Try it

1. Build `chron_request_patronage_interaction` as above (adjust to taste) with all loc keys, including the `desc` keys inside `ai_accept` modifiers.
2. Test both directions in-game: offer it yourself to an AI neighbor and check the answer tooltip shows your reasons with text. Then wait (or fast-forward) to see whether AI archive owners offer it to you.
3. Add a second `send_option` and branch the `on_accept` on it.
4. Stretch goal: replace the flat gold transfer with a `duel` on diplomacy against the recipient, success paying double.

Next: [Chapter 6: Content databases and localization](06-content.md) · [Back to index](index.md)
