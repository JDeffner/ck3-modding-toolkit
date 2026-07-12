# descriptor-path-ignored

**Severity:** Warning · **Source:** `ck3-descriptor`

## What breaks
`path=` tells the launcher where the mod folder is, which only makes sense in
the **outer** `<name>.mod` file (in `Documents/Paradox Interactive/Crusader
Kings III/mod/`). Inside `descriptor.mod` the launcher ignores it — and because
descriptor.mod ships with the mod, an absolute path like
`path="D:/Documents/..."` leaks your machine layout to everyone who downloads
it.

## Why
descriptor.mod is usually created by copying the outer .mod file; the `path`
line comes along for the ride.

## How to fix
Delete the `path=` line from descriptor.mod. Keep it in the outer
`<name>.mod` file, with forward slashes.
