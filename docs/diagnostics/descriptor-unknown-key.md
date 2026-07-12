# descriptor-unknown-key

**Severity:** Warning · **Source:** `ck3-descriptor`

## What breaks
Nothing loads differently — that is the problem. The launcher's descriptor key
set is closed (`name`, `version`, `supported_version`, `tags`, `path`,
`remote_file_id`, `picture`, `replace_path`, `dependencies`); anything else is
silently ignored, so a typo like `supported_versions=` quietly loses its
intended effect.

## How to fix
Check the spelling against the known keys (hover any key for its
documentation) or delete the line.
