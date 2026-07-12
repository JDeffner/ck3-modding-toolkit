# wrong-on-action-folder

**Severity:** Error · **Source:** `ck3-script`

## What the game does
CK3 reads on_actions from `common/on_action/` (**singular**). A file placed in
`common/on_actions/` (plural) is silently ignored — the hooks never fire.

## Why
The folder name is a hard-coded load path. The plural spelling is a very common
typo, and because there is no error the mod simply does nothing.

## How to fix
Move the file into `common/on_action/`.

## Before / after
```
common/on_actions/my_on_actions.txt   # ignored
```
```
common/on_action/my_on_actions.txt    # loaded
```
