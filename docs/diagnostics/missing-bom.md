# missing-bom

**Severity:** Error · **Source:** `ck3-script`

## What the game does
CK3 localization files must be UTF-8 **with** a BOM. Without the BOM the game
ignores the entire file — none of its keys load, and text shows as raw keys
(e.g. `my_event_t`) in game.

## Why
The loc loader uses the BOM to detect encoding. A BOM-less file is treated as an
unreadable/legacy encoding and skipped wholesale.

## How to fix
Save the file as **UTF-8 with BOM**. In VS Code: click the encoding in the
status bar → *Save with Encoding* → *UTF-8 with BOM*. Files created by the
extension's scaffolds already include the BOM.

## Before / after
```
(no BOM)  l_english:
```
```
(BOM)     l_english:
```
