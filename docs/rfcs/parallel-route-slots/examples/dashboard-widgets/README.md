# Dashboard Widgets

Route-scoped slots for a dashboard with multiple independently-loading widgets. Each widget has its own loader that runs in parallel.

## URL Examples

```
/dashboard                       # all widgets render at root (clean!)
/dashboard?@activity=/recent     # activity navigated to /recent
/dashboard?@metrics=/revenue     # metrics navigated to /revenue
/dashboard?@quickActions=false   # quick actions explicitly hidden
```

## File Structure

```
routes/
├── __root.tsx
├── dashboard.tsx               # defines scoped slots: activity, metrics, quickActions
├── dashboard.index.tsx         # main dashboard content
├── dashboard.@activity.tsx     # activity widget root
├── dashboard.@activity.index.tsx
├── dashboard.@activity.recent.tsx
├── dashboard.@metrics.tsx      # metrics widget root
├── dashboard.@metrics.index.tsx
├── dashboard.@metrics.revenue.tsx
├── dashboard.@metrics.users.tsx
├── dashboard.@quickActions.tsx # quick actions widget (single route)
└── index.tsx                   # home page
```

## Key Concepts

- Slots defined on `dashboard.tsx` are only available within the dashboard
- All widget loaders run in parallel with the dashboard loader
- Each widget can have internal navigation (activity, metrics) or be a single view (quickActions)
- Widgets can independently suspend/error without affecting others
