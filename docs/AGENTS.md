# Documentation

- Register new published pages in `router/config.json` or `start/config.json`; drafts need not be registered.
- Run `pnpm test:docs` from the repository root for Markdown link validation. It checks `docs/**/*.md`, not Markdown elsewhere. Relative links resolve from the containing file.
- A page with `ref:` is composed by tanstack.com from the page it names: each `replace` key is a regular expression (escape `|`, `(`, `)`, `.`, …), then each named section (`[//]: # 'Name'` … `[//]: # 'Name'`) of the page replaces the source's section of that name. Replace paragraphs, table rows and examples with named sections, not keys. `pnpm test:docs` composes every such page the same way (`scripts/verify-doc-refs.ts`) and checks it; add a page's expectations there when it replaces wording.
