# wrong-localization-folder

**Severity:** Error · **Source:** `ck3-script`

## What the game does
CK3 reads localization from `localization/` (American spelling). A file under
`localisation/` (British spelling) is silently ignored — none of its keys load.

## Why
The folder name is a hard-coded load path. The British spelling is a natural
mistake and, with no error, the loc simply never appears in game.

## How to fix
Move the file into `localization/`.

## Before / after
```
localisation/english/my_events_l_english.yml   # ignored
```
```
localization/english/my_events_l_english.yml   # loaded
```
