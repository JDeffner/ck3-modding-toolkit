# unclosed-brace

**Severity:** Error · **Source:** `ck3-script`

## What the game does
An unbalanced `{` swallows the rest of the file. CK3 silently ignores every
definition after the unclosed block — no error, no log entry, the content just
never loads.

## Why
The engine's parser is not error-tolerant. When it runs out of file before
finding the matching `}`, it discards the whole partial block and moves on.

## How to fix
Add the missing `}` (the diagnostic points at the opening brace that was never
closed). Matching brace-pair highlighting and the outline view help locate it.

## Before / after
```txt
my.1 = {
	immediate = {
		add_gold = 100
	# <- missing } here — everything below is ignored
}
```
```txt
my.1 = {
	immediate = {
		add_gold = 100
	}
}
```
