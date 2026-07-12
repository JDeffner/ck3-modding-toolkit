# loc-bad-filename

**Severity:** Error · **Source:** `ck3-script`

## What the game does
Localization files must end in `_l_<language>.yml`. A file under
`localization/` without that marker is silently ignored — none of its keys load.

## Why
CK3 discovers loc files by the `_l_<language>` filename suffix and uses it to
assign a language. A file named `my_events.yml` (no marker) is invisible to the
loader.

## How to fix
Rename the file to include the language marker, e.g.
`my_events_l_english.yml`.

## Before / after
```
localization/english/my_events.yml
```
```
localization/english/my_events_l_english.yml
```
