---
id: type-utilities
title: Type Utilities
---

Most types exposed by TanStack Router are internal, subject to breaking changes and not always easy to use. That is why TanStack Router has a subset of exposed types which are not internal and intended for the use of users. These types provide the same type safe experience from TanStack Router with flexibility of where to provide type checking

# Type checking Link options with `ValidateLinkOptions`

`ValidateLinkOptions` type checks object literal types to ensure they conform to `Link` options at inference sites. For example, you may have a generic `HeadingLink` component which accepts a `title` prop along with `linkOptions`, the idea being this component can be re-used for any navigation.

```tsx
export interface HeaderLinkProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TOptions = unknown,
> {
  title: string
  linkOptions: ValidateLinkOptions<TRouter, TOptions>
}

export function HeadingLink<TRouter extends RegisteredRouter, TOptions>(
  props: HeaderLinkProps<TRouter, TOptions>,
): React.ReactNode
export function HeadingLink(props: HeaderLinkProps): React.ReactNode {
  return (
    <>
      <h1>{props.title}</h1>
      <Link {...props.linkOptions} />
    </>
  )
}
```

A more permissive overload of `HeadingLink` is used to avoid type assertions you would otherwise have to do with the generic signature.

All type parameters for utilities are optional but for the best TypeScript performance `TRouter` should always be specified for the public facing signature. And `TOptions` should always be used at inference sites like `HeadingLink` to infer the `linkOptions` to correctly narrow `params` and `search`

The result of this is that `linkOptions` in the following is completely type-safe

```tsx
<HeadingLink title="Posts" linkOptions={{ to: '/posts' }} />
<HeadingLink title="Post" linkOptions={{ to: '/posts/$postId', params: {postId: 'postId'} }} />
```

# Type checking an array of Link options with `ValidateLinkOptionsArray`

All navigation type utilities have an array variant. `ValidateLinkOptions` enables type checking of an array of `Link` options. For example, you might have a generic `Menu` component where each item is a `Link`.

```tsx
export interface MenuProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TItems extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
> {
  items: ValidateLinkOptionsArray<TRouter, TItems>
}

export function Menu<
  TRouter extends RegisteredRouter,
  TItems extends ReadonlyArray<unknown>,
>(props: MenuProps<TRouter, TItems>): React.ReactNode
export function Menu(props: MenuProps): React.ReactNode {
  return (
    <ul>
      {props.items.map((item) => (
        <li>
          <Link {...item} />
        </li>
      ))}
    </ul>
  )
}
```

This of course allows the following `items` prop to be completely type-safe

```tsx
<Menu
  items={[
    { to: '/posts' },
    { to: '/posts/$postId', params: { postId: 'postId' } },
  ]}
/>
```

It is also possible for example to fix `from` with the help of `ValidateFromPath`. This would allow all `Menu` items to navigate relative from the current route

```tsx
export interface MenuProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TItems extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
  TFrom extends string = string,
> {
  from: ValidateFromPath<TRouter, TFrom>
  items: ValidateLinkOptionsArray<TRouter, TItems, TFrom>
}

export function Menu<
  TRouter extends RegisteredRouter,
  TItems extends ReadonlyArray<unknown>,
  TFrom extends string = string,
>(props: MenuProps<TRouter, TItems, TFrom>): React.ReactNode
export function Menu(props: MenuProps): React.ReactNode {
  return (
    <ul>
      {props.items.map((item) => (
        <li>
          <Link {...item} from={props.from} />
        </li>
      ))}
    </ul>
  )
}
```

`ValidateFromPath` provides type-safety to the `from` prop. `ValidateLinkOptionsArray` allows you to fix `from` by providing an extra type parameter. The result is type safe relative navigation for an array of `Link` options

```tsx
<Menu
  from="/posts"
  items={[{ to: '.' }, { to: './$postId', params: { postId: 'postId' } }]}
/>
```
