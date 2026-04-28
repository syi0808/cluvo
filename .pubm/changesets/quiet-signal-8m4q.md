---
packages/core: minor
packages/sdk: minor
---

Ignore user-cancellation failures by default so SIGINT/Ctrl+C-style aborts, exit code 130, and common abort errors are not collected as bug reports. Add an opt-out for applications that need to report cancellation errors.
