---
ref: docs/router/framework/react/guide/scroll-restoration.md
replace: { 'react-router': 'solid-router' }
---

[//]: # 'ManualRestorationExample'

```tsx
function Component() {
  // We need a unique ID for manual scroll restoration on a specific element
  // It should be as unique as possible for this element across your app
  const scrollRestorationId = 'myVirtualizedContent'

  // We use that ID to get the scroll entry for this element
  const scrollEntry = useElementScrollRestoration({
    id: scrollRestorationId,
  })

  // Let's use TanStack Virtual to virtualize some content!
  let virtualizerParentRef: any
  const virtualizer = createVirtualizer({
    count: 10000,
    getScrollElement: () => virtualizerParentRef,
    estimateSize: () => 100,
    // We pass the scrollY from the scroll restoration entry to the virtualizer
    // as the initial offset
    initialOffset: scrollEntry?.scrollY,
  })

  return (
    <div
      ref={virtualizerParentRef}
      // We pass the scroll restoration ID to the element
      // as a custom attribute that will get picked up by the
      // scroll restoration watcher
      data-scroll-restoration-id={scrollRestorationId}
      class="flex-1 border rounded-lg overflow-auto relative"
    >
      ...
    </div>
  )
}
```

[//]: # 'ManualRestorationExample'
