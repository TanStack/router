# Parallel Route Slots - Examples

These examples illustrate file structures and component patterns for different slot use cases.

**Note:** These are conceptual examples - they won't compile. They're meant to show what the developer experience would look like.

## Examples

1. **[modal-with-navigation](./modal-with-navigation/)** - Global modal slot with internal navigation (user profiles, settings, etc.)

2. **[dashboard-widgets](./dashboard-widgets/)** - Route-scoped slots for parallel-loading dashboard widgets (explicit placement)

3. **[component-routes](./component-routes/)** - Auto-rendering widget slots with `<Route.Slots>` iteration, conditional enabling, and staticData-based filtering

4. **[split-pane-mail](./split-pane-mail/)** - Email client with independently navigable list and preview panes

5. **[nested-slots](./nested-slots/)** - Modal with a nested confirmation dialog slot

## URL Examples

```
# Modal open with navigation (modal only in URL because it's navigated)
/products?@modal=/users/123&@modal.tab=profile

# Dashboard - all slots render by default, no URL params needed!
/dashboard

# Dashboard with one slot navigated away from root
/dashboard?@activity=/recent

# Dashboard with a slot explicitly disabled
/dashboard?@notifications=false

# Split pane mail - both slots render by default at their roots
/mail                                   # list and preview both at /
/mail?@list=/sent                       # list navigated to /sent
/mail?@list=/sent&@preview=/msg-456     # both navigated

# Nested slots
/app?@modal=/settings                   # modal open, confirm closed
/app?@modal=/settings&@modal@confirm    # confirm open at root
/app?@modal=/settings&@modal@confirm=/discard  # confirm at specific path
```

## Patterns Comparison

| Pattern           | Use Case          | Slot Placement                 | URL Behavior                         |
| ----------------- | ----------------- | ------------------------------ | ------------------------------------ |
| Modal             | Global overlays   | Explicit `<Route.SlotOutlet>`  | Manual open/close                    |
| Dashboard Widgets | Fixed layout      | Explicit `<Route.SlotOutlet>`  | Manual open/close                    |
| Component Routes  | Dynamic widgets   | `<Route.Slots>` iteration      | `defaultOpen: true` auto-adds to URL |
| Split Pane        | Independent panes | Explicit `<Route.SlotOutlet>`  | Both panes in URL                    |
| Nested Slots      | Layered UI        | Parent slot places child slots | Nested `@parent@child` prefix        |
