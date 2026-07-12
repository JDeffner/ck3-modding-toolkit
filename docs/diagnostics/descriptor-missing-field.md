# descriptor-missing-field

**Severity:** Error (`name`, `version`) / Warning (`supported_version`) · **Source:** `ck3-descriptor`

## What breaks
- Without `name=` or `version=` the launcher cannot list the mod properly
  (Workshop uploads additionally require a name of at least 3 characters).
- Without `supported_version=` the launcher cannot tell which CK3 version the
  mod targets, so players get no out-of-date warning.

## How to fix
Add the missing line; completion in the file offers every key with an example
value. `supported_version` accepts a `*` wildcard so one entry survives
hotfixes:

```
name="My Mod"
version="0.1.0"
supported_version="1.19.*"
```
