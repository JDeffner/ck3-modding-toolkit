# descriptor-duplicate-key

**Severity:** Warning · **Source:** `ck3-descriptor`

## What breaks
A key like `version=` or `name=` appears more than once. The launcher keeps
only the last value; the earlier line is dead and easy to edit by mistake.

`replace_path=` is the exception — it is meant to repeat, once per vanilla
folder to unload, and is never flagged.

## How to fix
Delete the earlier duplicate line(s), keeping the value you actually want.
