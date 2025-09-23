---
id: server-entry-point
title: Server Entry Point
---

# Server Entry Point

> [!NOTE]
> The server entry point is **optional** out of the box. If not provided, TanStack Start will automatically handle the server entry point for you using the below as a default.

This is done via the `src/server.ts` file.

```tsx
// src/server.ts
import handler from '@tanstack/react-start/server-entry'

export default {
  fetch(request: Request) {
    return handler.fetch(request)
  },
}
```

The entry point must conform to the following interface:

```tsx
export default {
  fetch(req: Request): Promise<Response> {
    // ...
  },
}
```

Whether we are statically generating our app or serving it dynamically, the `server.ts` file is the entry point for doing all SSR-related work.

## Custom Server Handlers

You can create custom server handlers to modify how your application is rendered:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

// Custom handler example
const customHandler = (request, response) => {
  // Add custom logic here
  return defaultStreamHandler(request, response)
}

const fetch = createStartHandler(customHandler)

export default {
  fetch,
}
```

## Server Configuration

The server entry point is where you can configure server-specific behavior:

- Request/response middleware
- Custom error handling
- Authentication logic
- Database connections
- Logging and monitoring

This flexibility allows you to customize how your TanStack Start application handles server-side rendering while maintaining the framework's conventions.
