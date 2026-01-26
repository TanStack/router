---
name: Automatic code splitting
description: Plugin-driven route splitting configuration.
version: 1
source: docs/router/framework/react/guide/automatic-code-splitting.md
---

# Automatic code splitting

## Summary

- Enable `autoCodeSplitting` in the bundler plugin.
- Configure `codeSplittingOptions` defaults and overrides.
- Do not export route properties if you want splitting.

## Use cases

- Split route components without manual lazy files
- Keep route modules thin in large apps
- Customize which exports are split

## Notes

- Route property exports disable splitting for that route.
- Per-route `codeSplitGroupings` override global settings.

## Examples

```ts
tanstackRouter({
  autoCodeSplitting: true,
  codeSplittingOptions: {
    defaultBehavior: 'split',
  },
})
```
