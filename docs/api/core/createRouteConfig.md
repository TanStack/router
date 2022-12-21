---
id: createRouteConfig
title: createRouteConfig
---

```tsx
import { createRouteConfig } from '@tanstack/router-core'

const rootConfig = createRouteConfig(options, children, isRoot, parentId, parentPath)
```

**Options**
- `options?`
  - **Optional**
- `children?: TKnownChildren`
  - **Optional**
- `isRoot?: boolean`
  - **Optional**
- `parentId?: string`
  - **Optional**
- `parentPath?: string`
  - **Optional**

**Returns**
- `rootConfig: CreateRouteConfigFn<true>`
