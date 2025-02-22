---
title: Custom Link
---

While repeating yourself can be acceptable in many situations, you might find that you do it too often. At times, you may want to create cross-cutting components with additional behavior or styles. You might also consider using third-party libraries in combination with TanStack Router’s type safety.

## `createLink` for cross-cutting concerns

`createLink` creates a custom `Link` component with the same type parameters as `Link`. This means you can create your own component which provides the same type safety and typescript performance as `Link`.

### Basic example

If you want to create a basic custom link component, you can do so with the following:

[//]: # 'BasicExampleImplementation'
[//]: # 'BasicExampleImplementation'

You can then use your newly created `Link` component as any other `Link`

```tsx
<CustomLink to={'/dashboard/invoices/$invoiceId'} params={{ invoiceId: 0 }} />
```

[//]: # 'ExamplesUsingThirdPartyLibs'
[//]: # 'ExamplesUsingThirdPartyLibs'
