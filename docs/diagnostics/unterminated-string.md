# unterminated-string

**Severity:** Warning · **Source:** `ck3-script`

## What the game does
A `"` with no closing `"` makes the engine read to the end of the line (or
further) as one string. The following tokens on that line are absorbed into the
value, so the assignment or block after it is misparsed and quietly ignored.

## Why
Paradox script strings are delimited by quotes. A runaway quote consumes
everything until the next quote — which may be lines away — corrupting the
structure in between.

## How to fix
Add the missing closing `"`.

## Before / after
```txt
desc = "my event description
```
```txt
desc = "my event description"
```
