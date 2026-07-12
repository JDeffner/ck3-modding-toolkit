# loc-content-before-header

**Severity:** Warning · **Source:** `ck3-script`

## What the game does
Non-comment content that appears before the `l_<language>:` header has no
language context yet, so the loader ignores those entries. They show as raw keys
in game.

## Why
The header must come first; only comments and blank lines may precede it. Real
entries above it are orphaned.

## How to fix
Move the header to the top so it precedes every entry.

## Before / after
```
 my_event_t:0 "Title"
l_english:
```
```
l_english:
 my_event_t:0 "Title"
```
