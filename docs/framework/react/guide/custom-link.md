---
title: Custom Link
---

While repeating yourself can be fine in many cases, you may find yourself repeating yourself too much. Sometimes you may want to make cross cutting components with extra behavior or styles. Or sometimes you may also use third party libraries and combine it with TanStack Router's type safety

## `createLink` for cross cutting concerns

`createLink` creates a custom `Link` component with the same type parameters as `Link`. This means you can create your own component which provides the same type safety and typescript performance as `Link`.

If you want to create a component which wraps `Link` with some additional styles or behavior then you can do so with the following

```tsx
import * as React from 'react'
import { Link, createLink } from '@tanstack/react-router'

export const NavigationLink = createLink(
  React.forwardRef((props: {}, ref: React.ForwardedRef<HTMLAnchorElement>) => {
    return (
      <Link
        {...props}
        ref={ref}
        className="block py-2 px-3 text-blue-700"
        preload="intent"
        activeProps={{ className: `font-bold` }}
      />
    )
  }),
)
```

> React.forwardRef will not be required in React 19 -->

You can then use your newly created `Link` component as any other `Link`

```tsx
<NavigationLink
  to="/dashboard/invoices/$invoiceId"
  params={{
    invoiceId: 0,
  }}
/>
```

## `createLink` with third party libraries

You might want to use third party component libraries with TanStack Router. For example to use `Button` from MUI you can use `createLink` which infers the types from both `Button` and `Link` while keeping type parameters necessary for TanStack Router's type safety

```tsx
import * as React from 'react'
import { createLink, Link, CreateLinkProps } from '@tanstack/react-router'
import { Button, ButtonProps } from '@mui/material'

const ButtonLink = createLink(
  React.forwardRef(
    (props: ButtonProps<'a'>, ref: React.ForwardedRef<HTMLAnchorElement>) => {
      return <Button {...props} ref={ref} component={Link} />
    },
  ),
)
```

`createLink` will infer types from the component passed to `createLink` and create a new `Link` component with TanStack Router's type parameters necessary for type safety and the additional props from `Button`

`ButtonLink` can then be used with props from both

```tsx
<ButtonLink to="/about" variant="outlined" />
```

If using props from `Link` like `to` is needed, you can use `CreateLinkProps`

```tsx
import * as React from 'react'
import { createLink, Link, CreateLinkProps } from '@tanstack/react-router'
import { Button, ButtonProps } from '@mui/material'

const ButtonLink = createLink(
  React.forwardRef(
    (
      props: CreateLinkProps & ButtonProps<'a'>,
      ref: React.ForwardedRef<HTMLAnchorElement>,
    ) => {
      return (
        <Button {...props} ref={ref} component={Link}>
          Navigate to {props.to}
        </Button>
      )
    },
  ),
)
```
