---
ref: docs/router/framework/react/guide/ssr.md
replace: { 'react-router': 'solid-router' }
---

[//]: # 'ClientEntryFileExample'

```tsx
// src/entry-client.tsx
import { hydrate } from 'solid-js/web'
import { RouterClient } from '@tanstack/solid-router/ssr/client'
import { createRouter } from './router'

const router = createRouter()

hydrate(() => <RouterClient router={router} />, document.body)
```

[//]: # 'ClientEntryFileExample'
