# missing-required-loc

**Severity:** Warning · **Source:** `ck3-script`

## What the game does
Many definition kinds require localization keys (e.g. `<name>` and
`<name>_desc`). Without them the game shows the raw key text (like
`my_decision_desc`) instead of readable text — a non-fatal but very visible
break.

## Why
The schema knows which loc keys each kind needs. This diagnostic fires only for
mod-owned definitions when a required key has no localization entry anywhere, so
vanilla/DLC is never flagged.

## How to fix
Add the missing key to a loc file for your language, or use the "Create missing
loc key" quick fix.

## Before / after
```
# my_decision defined, but my_decision_desc has no loc entry
```
```
l_english:
 my_decision:0 "My Decision"
 my_decision_desc:0 "What it does"
```
