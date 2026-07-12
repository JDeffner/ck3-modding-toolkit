# unknown-event

**Severity:** Warning · **Source:** `ck3-script`

## What the game does
A `trigger_event` (or similar) pointing at an event id that is not defined
anywhere does nothing — the event never fires and the game logs nothing.

## Why
This diagnostic only fires when the referenced namespace belongs to **your**
mod (so vanilla/DLC content is never falsely flagged). A reference to
`mymod.42` with no `mymod.42 = { … }` definition is almost always a typo or a
deleted event.

## How to fix
Define the event, or correct the id to an existing one.

## Before / after
```txt
trigger_event = mymod.42   # mymod.42 is never defined
```
```txt
trigger_event = mymod.1    # an event that exists
```
