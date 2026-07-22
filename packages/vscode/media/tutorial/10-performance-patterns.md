# Chapter 10: Performance and design patterns

Your mod works. This chapter is about making it *good*: fast enough that players never notice it running, and structured so a mechanic that works at version 0.1 still holds together at version 2.0. The patterns here are not theoretical; they are distilled from studying the largest published CK3 mods (the total conversions with thousands of files), where these problems were solved under production pressure.

## The performance model

CK3 simulates tens of thousands of living characters. Script cost comes from three places:

1. **World scans.** `every_living_character = { ... }` touches everyone. Inside a yearly pulse it is a yearly full-map pass; inside a *per-character* pulse it is N² and will visibly stutter the game.
2. **Per-frame UI reads.** Any script value the GUI displays recomputes every frame ([Chapter 7](07-gui.md)).
3. **Unbounded growth.** A variable list that gains members forever, iterated regularly, degrades a long campaign.

Three corresponding rules:

- **Never scan the world in a pulse.** Iterate bounded lists you maintain yourself.
- **Keep GUI-facing script values trivial.** Precompute heavy numbers into variables on a timer.
- **Cap every persistent list at insertion time.** Decide the maximum roster size when you design the feature, not after the bug report.

## Pattern: bounded lists on durable anchors

To model any roster (a society, a network, shareholders, your chronicle's patrons), store membership as a **variable list on a durable global object**: a faith, a title, or a global variable. Membership checks are `is_target_in_variable_list`; iteration is `every_in_list` over exactly the members, never the world.

```
# joining (capped at insertion)
faith:chron_patron_faith = {
	if = {
		limit = {
			NOT = { any_in_list = { variable = chron_patrons count >= 20 } }
		}
		add_to_variable_list = { name = chron_patrons target = scope:new_patron }
	}
}
```

Pair the list with a fast per-character marker (a variable or character flag) for O(1) membership checks, keeping the list itself for iteration and precedence. Add a status script value that collapses rank to one comparable number and you have the complete skeleton of a "secret society" with no map presence at all: this is precisely how the vampire mod Princes of Darkness models the Camarilla (rosters on a faith object, a `camarilla_status` value from 8 down to 1, interactions gated on `status >= 7`).

## Pattern: per-actor story cycles instead of global pulses

When each participating character needs their own recurring behavior (an AI life arc, a slow plot, a progression clock), do not write one yearly pulse that scans for participants. Attach a **story cycle** to each participant ([Chapter 4](04-events.md)):

```
# common/story_cycles/chron_story_cycles.txt
story_chron_rival_chronicler = {
	on_setup = {
		story_owner = { set_variable = { name = chron_rivalry value = 0 } }
	}
	on_end = { }
	on_owner_death = {
		# real cleanup: remove links other objects hold to this story/owner
	}

	effect_group = {
		months = { 6 18 }              # randomized interval de-syncs the herd
		trigger = {
			story_owner = {
				is_ai = yes
				is_at_war = no
			}
		}
		triggered_effect = {
			trigger = { always = yes }
			effect = {
				story_owner = { change_variable = { name = chron_rivalry add = 1 } }
			}
		}
	}

	# kill switch: AI machinery must stop when a player takes over
	effect_group = {
		days = 30
		trigger = { story_owner ?= { is_ai = no } }
		triggered_effect = {
			trigger = { always = yes }
			effect = { end_story = yes }
		}
	}
}
```

The story IS the pulse and touches only its owner. Cost scales with participating actors, not world size. Randomized intervals (`months = { 6 18 }`) prevent thousands of stories ticking on the same day. Two disciplines the big mods learned the hard way: **every AI story needs the is_ai kill switch** (the largest mods end theirs the moment the player takes over), and **`on_owner_death` needs real cleanup**, or dead characters leak dangling references. Stories also make natural state machines: hold variables, wait cheaply for offscreen outcomes (`var:victim ?= { is_alive = no }`), then fire the payoff.

A related budgeting trick for genuinely global passes: **amortization counters**. A yearly pulse increments a global counter 1 to 4 and only runs the expensive pass on 4, spreading a costly computation across years. One production mod runs its entire banking economy this way: a yearly hook, a bounded shareholder list, and a bookkeeping counter.

## Pattern: gate the AI hard

Flavor is for players; simulation is for everyone. Big mods gate almost all flavor event pulses with `is_ai = no`, letting AI state move only through a few deterministic, cheap paths. Complementary throttles worth copying:

- **AI auto-heal from terminal states.** If your mechanic has a worst tier (exposed, disgraced, bankrupt), give AI characters a hidden event that eventually pulls them one step back. Otherwise half the world ends up permanently stuck at the extreme, which is both ugly and expensive.
- **`ai_targets` always bounded with `max`** on AI-initiated interactions ([Chapter 5](05-decisions-interactions.md)), plus a cheap `ai_target_quick_trigger` pre-filter before any expensive `is_shown`.
- **Personality attributes over trait ladders** for AI weights: `ai_honor`, `ai_greed`, `ai_boldness` and friends give smooth variance at no extra script cost.

## Pattern: tiered modifiers as meters

For a 0-to-5 "meter" (exposure, notoriety, favor), the strongest representation is often **not a variable** but a family of mutually exclusive character modifiers (`chron_fame_0` through `chron_fame_5`):

- Each tier modifier carries its game effects directly (opinion, stress, AI weights), so penalties apply themselves with no separate enforcement pass.
- Tiers are self-documenting in the character sheet and localize per tier.
- A script value reads the current tier back for script and GUI via an if/else ladder over `has_character_modifier`.

Route **all mutation through one wrapper effect** that removes the old tier, clamps against a floor and ceiling, and applies the new one:

```
chron_change_fame_effect = {           # DELTA = +1 / -1 / ...
	# read tier, add $DELTA$, clamp to [chron_fame_floor, 5], switch modifiers
}
```

Because nothing else mutates the state, the clamp holds everywhere, forever. If the GUI needs the meter inverted (a "safety" bar that empties as danger rises), define a second, clearly named display value instead of negating in place; sign-flip bugs breed in ad-hoc inversions.

## Pattern: named magnitude wrappers

When many events need "a chance of X happening", do not scatter `random = { chance = 25 ... }` across a hundred files. Define named probability wrappers once:

```
# common/scripted_effects/chron_risk_effects.txt
chron_small_risk_of_scandal_effect    = { random = { chance = 10  modifier = { factor = chron_risk_mult } chron_scandal_effect = yes } }
chron_moderate_risk_of_scandal_effect = { random = { chance = 25  modifier = { factor = chron_risk_mult } chron_scandal_effect = yes } }
chron_high_risk_of_scandal_effect     = { random = { chance = 50  modifier = { factor = chron_risk_mult } chron_scandal_effect = yes } }
```

Call sites stay dumb (`chron_moderate_risk_of_scandal_effect = yes`); all balance lives in one file, and one shared `*_mult` script value lets traits, perks and doctrines modulate every risk in the game with zero call-site changes. Princes of Darkness runs its entire masquerade-breach economy through exactly five such wrappers, and it is the single most transferable structural idea in that mod.

## Pattern: concrete consequences, not abstract ticks

When a hidden mechanic "goes wrong", the strong move is to spawn a **tangible threat object** rather than adjusting a number. PoD's masquerade breach creates an actual witness character (`create_character` from a template) at your capital, flagged, pinned in place for two years, with a re-entry cooldown flag, and every response option (bribe, silence, eliminate) interacts with that person. The witness IS the threat. If you spawn NPCs this way, give them a full lifecycle (resolution, timeout, removal) or you leak courtiers.

Two vanilla systems give you drama infrastructure for free:

- **Secrets** (`common/secret_types/`): author `is_shunned`, `is_criminal`, `on_discover`, `on_expose` and `on_owner_death` hooks, and the engine's discovery and blackmail economy does the rest. Transfer ownership on death (`set_secret_owner = scope:heir`) and a conspiracy outlives its keeper.
- **Important actions** (`common/important_actions/`): the alert feed. A `check_create_action` that validates an opportunity plus an `effect` that opens the right interaction window is how the player cheaply "hears about" offscreen AI activity. Set `combine_into_one = yes` on anything that can trigger for many characters at once, or you spam the feed.

## Anti-patterns (observed in the wild, do not copy)

- **Hardcoded character IDs in logic** (`this = character:12345` as a gate). A total-conversion luxury that breaks in every other context; gate on traits, variables or flags.
- **Full-file vanilla `.gui` overrides** for convenience. The mods that do this re-diff every patch and are the first to break.
- **Unbounded `every_courtier`/`every_vassal` in recurring script** without a headcount cap; even big mods' own dev comments flag these as cost risks.
- **Per-tick maintenance sweeps** (re-equipping artifacts yearly, re-applying modifiers): model persistent state as traits or modifiers that simply stay.
- **`ai_chance` omitted on event options**: the AI picks uniformly at random, which is almost never the design intent.

## Where to go from here

- Read vanilla files the way you would read a senior colleague's code. The `_*.info` schemas plus `tests/` (engine self-tests with asserted outcomes) answer most questions.
- Study one big mod in your genre. The two referenced throughout this chapter, A Game of Thrones and Princes of Darkness, are exemplary for AI-driven drama and custom UI respectively; both are on the Workshop and their file structure rewards grepping.
- The [CK3 wiki modding hub](https://ck3.paradoxwikis.com/Modding) and the CK3 Modding Discord fill the gaps; when the wiki and your local game files disagree, the files win.
- Before every release: **CK3: Show Mod Report**, a clean tiger run with loc checks re-enabled, **CK3 Tiger: Find Unused Definitions**, and a fresh look at `database_conflicts.log`.

## Try it

A capstone that exercises the whole tutorial: turn the chronicle into a living mechanic.

1. Replace any yearly-pulse chronicle flavor with a `story_chron_legacy` story cycle attached by the archive decision, ticking every 1 to 3 years, complete with the is_ai kill switch and `on_owner_death` cleanup.
2. Convert chronicle fame from a variable into tiered modifiers (`chron_fame_0..3`) with one clamped setter effect, and repoint the Chapter 7 HUD bar's script value at the tiers.
3. Add `chron_small/moderate/high_risk_of_scandal_effect` wrappers, one shared `chron_risk_mult` value (lower it for `honest` characters), and call them from your events.
4. Run the full release ritual from Chapter 9 on the result.

Congratulations, you have covered the whole arc: from a `.mod` file to production-grade design patterns. Go build something the rest of us subscribe to.

[Back to index](index.md)
