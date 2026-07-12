# loc-tab-indent

**Severity:** Error · **Source:** `ck3-script`

## What the game does
CK3 rejects tab characters used for indentation in localization files. Affected
entries fail to load and show as raw keys in game.

## Why
Unlike script files (which use tabs), the loc loader only accepts spaces for the
leading indentation of an entry. A tab there is treated as a format error.

## How to fix
Indent loc entries with a single space (the vanilla convention), not a tab.

## Before / after
```
l_english:
	my_event_t:0 "Title"   # <- leading TAB
```
```
l_english:
 my_event_t:0 "Title"     # <- leading space
```
