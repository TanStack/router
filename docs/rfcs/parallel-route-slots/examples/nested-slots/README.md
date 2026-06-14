# Nested Slots

A modal that contains its own nested confirmation dialog slot. Demonstrates slots within slots.

## URL Examples

```
/app                                           # no modal
/app?@modal=/settings                          # settings modal open
/app?@modal=/settings&@modal@confirm           # confirm dialog open at root
/app?@modal=/settings&@modal@confirm=/discard  # specific confirm action
```

## File Structure

```
routes/
├── __root.tsx              # defines global modal slot
├── @modal.tsx              # modal wrapper, defines nested confirm slot
├── @modal.index.tsx
├── @modal.settings.tsx
├── @modal.@confirm.tsx     # nested slot root (confirm dialog)
├── @modal.@confirm.index.tsx
├── @modal.@confirm.discard.tsx
├── @modal.@confirm.delete.tsx
└── index.tsx
```

## Key Concepts

- `@modal.@confirm` is a slot within the modal slot
- URL uses nested prefix: `@modal@confirm=/discard`
- The modal can open confirmation dialogs without closing itself
- Confirmation dialogs have their own routes for different actions
