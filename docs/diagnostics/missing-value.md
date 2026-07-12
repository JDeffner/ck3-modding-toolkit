# missing-value

**Severity:** Warning · **Source:** `ck3-script`

## What the game does
An assignment operator (`=`, `<`, `>=`, …) with nothing after it is incomplete.
The engine either skips the key or misreads the next key as this value, so the
intended setting never takes effect.

## Why
`key = value` requires a value. A dangling operator — often a leftover from an
edit — leaves the parser with a key it cannot resolve.

## How to fix
Supply the value, or remove the stray operator.

## Before / after
```txt
add_gold =
trigger_event = my.2
```
```txt
add_gold = 100
trigger_event = my.2
```
