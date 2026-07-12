# loc-no-header

**Severity:** Error · **Source:** `ck3-script`

## What the game does
Without an `l_<language>:` header line the game loads **none** of the entries in
the file. Every key in it shows as a raw key in game.

## Why
The header tells the loader which language the following entries belong to.
Entries before (or without) a header have no language to file under, so they are
dropped.

## How to fix
Add the header as the first non-BOM line, e.g. `l_english:`.

## Before / after
```
 my_event_t:0 "Title"
```
```
l_english:
 my_event_t:0 "Title"
```
