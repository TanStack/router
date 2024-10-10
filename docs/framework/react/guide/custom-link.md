---
title: Custom Link
---

While repeating yourself can be acceptable in many situations, you might find that you do it too often. At times, you may want to create cross-cutting components with additional behavior or styles. You might also consider using third-party libraries in combination with TanStack Router’s type safety.

## `createLink` for cross-cutting concerns

`createLink` creates a custom `Link` component with the same type parameters as `Link`. This means you can create your own component which provides the same type safety and typescript performance as `Link`.

### Basic example

If you want to create a basic custom link component, you can do so with the following:

```tsx
import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'

interface OwnLinkComponentProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  // Add any additional props you want to pass to the anchor element
}

const OwnLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  OwnLinkComponentProps
>((props, ref) => (
  <a ref={ref} {...props} className={'block px-3 py-2 text-blue-700'} />
))

const CreatedLinkComponent = createLink(OwnLinkComponent)

export const CustomLink: LinkComponent<typeof OwnLinkComponent> = (props) => {
  return <CreatedLinkComponent preload={'intent'} {...props} />
}
```

You can then use your newly created `Link` component as any other `Link`

```tsx
<CustomLink to="/dashboard/invoices/$invoiceId" params={{ invoiceId: 0 }} />
```

## `createLink` with third party libraries

### React Aria Components example

React Aria Components’ [Link](https://react-spectrum.adobe.com/react-aria/Link.html) component doesn’t support the standard `onMouseEnter` and `onMouseLeave` events, so you can’t use them directly with TanStack Router’s `preload` prop.

Explanation for this can be found here:

- [https://react-spectrum.adobe.com/react-aria/interactions.html](https://react-spectrum.adobe.com/react-aria/interactions.html)
- [https://react-spectrum.adobe.com/blog/building-a-button-part-2.html](https://react-spectrum.adobe.com/blog/building-a-button-part-2.html)

It is, however, possible to get around this by dropping down to the [useLink](https://react-spectrum.adobe.com/react-aria/useLink.html) hook from
[React Aria Hooks](https://react-spectrum.adobe.com/react-aria/hooks.html) and use it with a normal anchor element.

```tsx
import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'
import {
  mergeProps,
  useFocusRing,
  useHover,
  useLink,
  useObjectRef,
} from 'react-aria'
import type { AriaLinkOptions } from 'react-aria'

interface OwnLinkComponentProps extends Omit<AriaLinkOptions, 'href'> {
  children?: React.ReactNode
}

const OwnLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  OwnLinkComponentProps
>((props, forwardedRef) => {
  const ref = useObjectRef(forwardedRef)

  const { isPressed, linkProps } = useLink(props, ref)
  const { isHovered, hoverProps } = useHover(props)
  const { isFocusVisible, isFocused, focusProps } = useFocusRing(props)

  return (
    <a
      {...mergeProps(linkProps, hoverProps, focusProps, props)}
      ref={ref}
      data-hovered={isHovered || undefined}
      data-pressed={isPressed || undefined}
      data-focus-visible={isFocusVisible || undefined}
      data-focused={isFocused || undefined}
    />
  )
})

const CreatedLinkComponent = createLink(OwnLinkComponent)

export const CustomLink: LinkComponent<typeof OwnLinkComponent> = (props) => {
  return <CreatedLinkComponent preload={'intent'} {...props} />
}
```

### Chakra UI example

```tsx
import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'
import { Link } from '@chakra-ui/react'

const ChakraLinkComponent = (
  props: Omit<React.ComponentPropsWithoutRef<typeof Link>, 'href'>,
) => <Link {...props} />

const CreatedLinkComponent = createLink(ChakraLinkComponent)

export const CustomLink: LinkComponent<typeof ChakraLinkComponent> = (
  props,
) => {
  return (
    <CreatedLinkComponent
      textDecoration="underline"
      _hover={{ textDecoration: 'none' }}
      _focus={{ textDecoration: 'none' }}
      preload="intent"
      {...props}
    />
  )
}
```

### MUI example

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
