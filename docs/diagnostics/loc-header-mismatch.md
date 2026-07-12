# loc-header-mismatch

**Severity:** Error · **Source:** `ck3-script`

## What the game does
When the `l_<language>:` header does not match the `_l_<language>.yml` filename
marker, the game does not load the entries. The keys silently fail to resolve.

## Why
CK3 routes each loc file to a language by its filename, then expects the header
inside to declare the same language. A mismatch means the file's contents are
filed under a language the loader isn't reading for that file.

## How to fix
Make the header and the filename agree.

## Before / after
```
# file: my_events_l_english.yml
l_french:
 my_event_t:0 "Title"
```
```
# file: my_events_l_english.yml
l_english:
 my_event_t:0 "Title"
```
