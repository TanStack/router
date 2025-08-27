# Authentication Troubleshooting Guide

Quick reference for Stack Auth + TanStack Start integration issues.

## ⚠️ Critical Issues

### 1. Handler Route Naming
**❌ Wrong**: `handler.$splat.tsx`, `handler.$_.tsx`, `handler._.tsx`  
**✅ Correct**: `handler.$.tsx` (with `$` symbol only)

### 2. SSR Compatibility
**❌ Wrong**: Render `StackHandler` during SSR  
**✅ Correct**: Use client-only rendering with `useState` + `useEffect`

### 3. Route Creation
**❌ Wrong**: `createFileRoute("/handler/$")`  
**✅ Correct**: `createFileRoute()` (no arguments)

## Working Solution

*Note: These are simplified examples. The actual code includes additional UI components, navigation, and features.*

### Handler Route ([src/routes/handler.$.tsx](src/routes/handler.%24.tsx))
```tsx
import { StackHandler } from "@stackframe/react";
import { stackClientApp } from "../stack";
import { useRouter, createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

function HandlerComponent() {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <div>Loading...</div>;
  }

  return <StackHandler app={stackClientApp} location={pathname} fullPage />;
}

export const Route = createFileRoute()({
  component: HandlerComponent,
});
```

### Root Route ([src/routes/__root.tsx](/src/routes/__root.tsx)
```tsx
import { StackProvider, StackTheme } from "@stackframe/react";
import { stackClientApp } from "../stack";

function RootComponent() {
  return (
    <StackProvider app={stackClientApp}>
      <StackTheme>
        <Outlet />
      </StackTheme>
    </StackProvider>
  );
}
```

## Common Issues

| Issue | Solution |
|-------|----------|
| 404 on `/handler/sign-in` | Use `handler.$.tsx` naming, restart dev server |
| `window is not defined` | Add client-only rendering to handler route |
| Route tree errors | Delete `src/routeTree.gen.ts`, restart dev server |
| TypeScript errors | Use `createFileRoute()` with no arguments |

## Environment Variables
```env
VITE_STACK_PROJECT_ID=your_project_id
VITE_STACK_PUBLISHABLE_CLIENT_KEY=your_publishable_key
STACK_SECRET_SERVER_KEY=your_secret_key
```

## Key Points

1. **Handler route must be client-only** - never render during SSR
2. **Use `handler.$.tsx`** - this is the only working catch-all naming
3. **Single handler file** - avoid duplicate route declarations
4. **Client-only auth UI** - use `useState` + `useEffect` pattern

## What NOT to Do

- ❌ Use `handler.$splat.tsx`, `handler.$_.tsx`, or `handler._.tsx`
- ❌ Use `createFileRoute("/handler/$")`
- ❌ Render `StackHandler` during SSR
- ❌ Use Stack Auth hooks in SSR components
- ❌ Create multiple handler route files
