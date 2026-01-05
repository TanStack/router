# Component Routes (Auto-Rendering Widget Slots)

A dashboard where widget slots automatically render when the parent route matches. Slots can be filtered by meta, conditionally enabled, and dynamically arranged.

## URL Examples

```
# Default - all enabled slots render, clean URL!
/dashboard

# Activity navigated to a different view
/dashboard?@activity=/recent

# User explicitly disabled notifications
/dashboard?@notifications=false

# Admin user - adminPanel auto-enabled, no URL change needed
/dashboard

# Non-admin user won't see adminPanel (enabled returns false)
/dashboard
```

## File Structure

```
routes/
├── __root.tsx
├── dashboard.tsx                    # uses <Route.Slots> to iterate
├── dashboard.index.tsx              # main dashboard content
├── dashboard.@header.tsx            # explicitly placed (not in iteration)
├── dashboard.@activity.tsx          # area: 'main', priority: 1
├── dashboard.@metrics.tsx           # area: 'main', priority: 2
├── dashboard.@notifications.tsx     # area: 'main', priority: 3, user can disable
├── dashboard.@adminPanel.tsx        # area: 'main', admin only
├── dashboard.@quickActions.tsx      # area: 'sidebar'
└── dashboard.@userCard.tsx          # area: 'sidebar'
```

## Key Concepts

- **Slots render by default** - No URL param needed for default state
- **enabled** - Opt-out function to conditionally disable slots
- **`=false` in URL** - Users can explicitly disable slots via URL
- **meta** - Static metadata for filtering and organizing slots
- **<Route.Slots>** - Render prop to iterate over all enabled slots
- **Mixed approach** - Combine explicit `<Route.SlotOutlet>` with dynamic iteration
