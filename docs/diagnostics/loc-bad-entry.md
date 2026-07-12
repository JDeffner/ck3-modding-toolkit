# loc-bad-entry

**Severity:** Warning · **Source:** `ck3-script`

## What the game does
A malformed line that isn't a valid `key: "value"` entry is skipped by the
loader. That single key fails to load while the rest of the file is fine, so it
shows as a raw key in game.

## Why
The loc format is `key:<optional version> "value"`. Missing colon, missing
quotes, or stray characters make the line unparseable as an entry.

## How to fix
Write the line as `key: "value"` (a `:0` version suffix is conventional).

## Before / after
```
 my_event_t Title without quotes
```
```
 my_event_t:0 "Title"
```
