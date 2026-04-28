---
packages/core: patch
packages/sdk: patch
packages/cli: patch
---

Harden local report storage and sanitization for scoped package names, malformed store files, unsafe path-like identifiers, inline secret flags, modern service tokens, and nested metadata. Also isolate file fallback drafts under the configured store when possible and make the built CLI bin execute correctly in Node-based consumers.
