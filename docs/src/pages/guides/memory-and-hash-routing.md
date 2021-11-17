---
id: memory-and-hash-routing
title: Memory and Hash Routing
---

## Hash Routing

Hash routing can be helpful if your server doesn't support rewrites to `index.html` for http requests (among other environments that don't have a server).

```tsx
import { createHashHistory, ReactLocation } from 'react-location'

// Create a hash history
const hashHistory = createHashHistory()

// Set up a ReactLocation instance with the hash history
const location = new ReactLocation({
  history: hashHistory,
})
```

## Memory Routing

Memory routing is useful in environments that are not a browser, like `node.js` or `electron`.

```tsx
import { createMemoryHistory, ReactLocation } from 'react-location'

// Create a memory history
const memoryHistory = createMemoryHistory('/') // Pass your initial url

// Set up a ReactLocation instance with the memory history
const location = new ReactLocation({
  history: memoryHistory,
})
```
