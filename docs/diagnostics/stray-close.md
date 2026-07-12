# stray-close

**Severity:** Error · **Source:** `ck3-script`

## What the game does
A `}` with no matching `{` throws off the engine's brace counting. CK3 may
misread the rest of the file, dropping or misattributing the definitions that
follow it — usually with no error output.

## Why
Every `}` closes the nearest open block. An extra one closes a block the author
never opened (often the file's top level), so subsequent content is parsed in
the wrong context or discarded.

## How to fix
Delete the surplus `}` (the diagnostic points at it), or add the `{` it was
meant to close.

## Before / after
```txt
my_decision = {
	cost = { gold = 50 }
}
}   # <- stray close
```
```txt
my_decision = {
	cost = { gold = 50 }
}
```
