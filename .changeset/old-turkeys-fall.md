---
"@tanstack/router-core": patch
---

Reuse path-parameter decoders across router option updates when the allowed characters are unchanged, preserving warm Link paths during provider updates. Rebuild the decoder when values change and restore default encoding when the option is removed.
