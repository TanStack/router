---
id: deferred-hydration
title: Deferred Hydration
---

> Deferred hydration is experimental

Server rendering gives users useful HTML quickly. Hydration is the client-side work that turns that HTML into an interactive app. That work includes loading the JavaScript for client components, executing that JavaScript, running the components, attaching event handlers, and reconnecting the rendered DOM to the app tree.

On small pages this cost is usually fine. On large pages, especially on mobile devices, interactivity can be delayed by both parts of the cost: waiting for JavaScript to load and waiting for the browser to execute that JavaScript and hydrate the components. Hydrating the whole page immediately can also keep the main thread busy during the first interactions. Deferred hydration lets you keep the SSR HTML while delaying selected JavaScript loading and hydration work until that part of the page is likely to matter.

This is useful when a page has content that should be visible and indexable immediately, but does not need to be interactive immediately.

## A Motivating Example

Imagine a product detail page:

```tsx
import { Hydrate } from '@tanstack/react-start'
import {
  idle,
  interaction,
  never,
  visible,
} from '@tanstack/react-start/hydration'

export function ProductPage() {
  return (
    <>
      <ProductHero />
      <BuyBox />

      <Hydrate when={visible({ rootMargin: '800px' })} prefetch={idle()}>
        <Reviews />
      </Hydrate>

      <Hydrate
        when={interaction()}
        prefetch={visible({ rootMargin: '1200px' })}
        fallback={<RecommendationsSkeleton />}
      >
        <RecommendationCarousel />
      </Hydrate>

      <Hydrate when={never()}>
        <StaticTrustBadges />
      </Hydrate>
    </>
  )
}
```

In this page, the hero and buy box are critical. They should be interactive immediately, so they are not deferred.

The reviews are useful SSR content, but they are below the initial viewport. `visible()` keeps their HTML in the document and hydrates them when the user scrolls near them. `prefetch={idle()}` lets TanStack Start start loading the generated child chunk during browser idle time so the reviews are more likely to be ready by the time they enter view.

The recommendation carousel is expensive and only matters if the user interacts with it. `interaction()` delays hydration until there is user intent, while `prefetch={visible(...)}` can start downloading the chunk before the first interaction.

The trust badges are static SSR HTML. `never()` keeps them non-interactive during initial hydration and avoids client work for that boundary.

## Why This Requires Application Knowledge

TanStack Start cannot know which parts of your app are safe to delay. The right boundary depends on your layout, your product priorities, and real user behavior.

Good candidates are usually parts of the page that are visible in SSR HTML but not needed for immediate interaction:

- Below-the-fold reviews, comments, related content, product details, or long marketing sections.
- Rich widgets such as maps, charts, carousels, video players, editors, or embeds.
- Panels that are visible later or activated by intent, such as filters, preview panes, or contextual tools.
- Responsive UI that only matters for a matching media query.
- Static server-rendered content that should never hydrate on the initial document.

Poor candidates are parts of the page users expect to use immediately:

- Primary navigation, route chrome, search boxes, and login/account controls.
- Above-the-fold forms, add-to-cart buttons, checkout actions, or consent controls.
- The interactive part of the LCP/hero area when users may click it immediately.
- Accessibility-critical controls that must be keyboard-ready as soon as the page appears.
- Components whose props or shared state are expected to update immediately after app startup.

Use measurements to validate each boundary. Deferred hydration is a performance tool, not a blanket rule. A good boundary reduces startup JavaScript and main-thread work without making expected interactions feel late.

## What Deferred Hydration Does

Deferred hydration is different from `ssr: false` and `ssr: 'data-only'`. Those route options change whether a route renders HTML on the server. Deferred hydration still renders real SSR HTML, then delays selected client JavaScript work.

TanStack Start keeps the normal app model:

- One app root.
- Router context, loaders, links, head management, and SPA navigation.
- Server-rendered HTML for the deferred boundary.
- Client hydration when the chosen strategy resolves.

By default, the compiler extracts each split `Hydrate` boundary's children into a separate client chunk. The server still renders the children normally, but the browser does not load and execute that child chunk until the boundary is ready or prefetched.

## Basic Usage

Use `Hydrate` with strategy factories from `@tanstack/react-start/hydration`:

```tsx
import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'

export function ProductPage() {
  return (
    <Hydrate when={visible({ rootMargin: '400px' })}>
      <Reviews />
    </Hydrate>
  )
}
```

`Hydrate` only preserves server HTML for boundaries that are present in the initial server-rendered document. When a boundary first mounts after the app has already hydrated, such as after client-side navigation, TanStack Start renders it on the client because no server HTML exists to preserve.

Use `fallback` for that no-SSR-DOM case only. It is shown if the boundary first mounts after the app is hydrated and the transformed child chunk, or another child `Suspense`, is still loading:

```tsx
<Hydrate when={visible()} fallback={<ReviewsSkeleton />}>
  <Reviews />
</Hydrate>
```

`fallback` does not replace server-rendered HTML in the initial document. During initial hydration, TanStack Start preserves the existing server HTML until the boundary can hydrate. With `never()`, the initial server HTML remains static and `fallback` is not used.

The compiler removes statically visible `fallback` props from the server bundle. Prefer passing `fallback` directly, in an inline object spread, or through a single-use `const` object spread so server builds can strip that UI completely.

## Splitting And Prefetching

By default, `Hydrate` splits the children into a generated child chunk. This delays both hydration work and child JavaScript loading.

Set `split={false}` when you only want to delay hydration work without splitting the child code:

```tsx
import { idle } from '@tanstack/react-start/hydration'

export function ProductPage() {
  return (
    <Hydrate when={idle()} split={false}>
      <SmallWidget />
    </Hydrate>
  )
}
```

Because `prefetch` only loads the compiler-generated child chunk, it is only valid on split boundaries. TypeScript rejects `prefetch` when `split={false}`.

Use `prefetch` when the child chunk should load before the boundary hydrates. `when` controls when the boundary becomes interactive. `prefetch` controls when TanStack Start calls the generated child chunk's lazy preload function:

```tsx
import { idle, interaction, visible } from '@tanstack/react-start/hydration'

<Hydrate when={interaction()} prefetch={idle()}>
  <ProductRecommendations />
</Hydrate>

<Hydrate
  when={interaction()}
  prefetch={visible({ rootMargin: '1200px' })}
>
  <RelatedProducts />
</Hydrate>
```

Common pairings:

| Boundary goal                              | `when`               | `prefetch`                          |
| ------------------------------------------ | -------------------- | ----------------------------------- |
| Hydrate below-the-fold content on scroll   | `visible()`          | `idle()` or none                    |
| Prepare content before it reaches viewport | `visible()`          | `visible({ rootMargin: '1200px' })` |
| Keep a widget cold until user intent       | `interaction()`      | `visible(...)` or `idle()`          |
| Hydrate non-critical work after startup    | `idle()`             | none                                |
| Hydrate only when app state says it is OK  | `condition(isReady)` | `idle()`, `visible(...)`, or none   |
| Keep initial SSR HTML static               | `never()`            | not supported                       |

## Strategies

`when` accepts a hydration strategy object:

| Strategy        | Behavior                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `load()`        | Hydrates as soon as the app hydrates.                                                                   |
| `idle()`        | Hydrates in `requestIdleCallback`, or after `timeout` when idle callbacks are unavailable.              |
| `visible()`     | Hydrates when the boundary marker enters the viewport.                                                  |
| `media()`       | Hydrates when the media query matches.                                                                  |
| `interaction()` | Hydrates on the configured interaction intent events. Defaults to hover, focus, pointer down, or click. |
| `condition()`   | Hydrates once the condition is truthy.                                                                  |
| `never()`       | Never hydrates the initial server-rendered boundary.                                                    |

Use `never()` for intentionally static initial SSR HTML:

```tsx
import { never } from '@tanstack/react-start/hydration'

export function MarketingPage() {
  return (
    <Hydrate when={never()}>
      <StaticMarketingBlock />
    </Hydrate>
  )
}
```

`never()` keeps the existing server HTML static during initial hydration. If the same boundary mounts later during client-side navigation, it renders normally because no server HTML exists for TanStack Start to preserve. `never()` cannot be used as a `prefetch` strategy.

Use `condition()` for app-specific one-time hydration conditions:

```tsx
import { condition } from '@tanstack/react-start/hydration'

export function CartPage() {
  return (
    <Hydrate when={condition(isCartOpen)}>
      <CartRecommendations />
    </Hydrate>
  )
}
```

After a condition boundary hydrates, it stays hydrated even if `condition` later becomes false.

For `interaction`, TanStack Start installs lightweight native intent listeners on the boundary marker, or on the nearest unresolved ancestor marker when a nested interaction boundary has not mounted yet. Those listeners open hydration gates and start deferred chunk loading. For bubbling intent events, TanStack Start queues a same-type event and redispatches it after the boundary hydrates so the first click-like interaction can reach React handlers. Native listener payload details such as pointer coordinates are not guaranteed to be preserved.

The default interaction event list is `pointerenter`, `focusin`, `pointerdown`, and `click`. Use `events` when a boundary should listen to a different event or a smaller set:

```tsx
<Hydrate when={interaction({ events: 'dblclick' })}>
  <PreviewEditor />
</Hydrate>

<Hydrate when={interaction({ events: ['contextmenu', 'dblclick'] })}>
  <ContextMenuEditor />
</Hydrate>
```

Nested boundaries use parent-first hydration. A child boundary can only hydrate after its ancestor boundaries have hydrated, so non-interaction child triggers such as `visible`, `media`, `idle`, or `condition` cannot fire while their parent boundary is still dehydrated. When a user shows interaction intent inside a nested unhydrated boundary, TanStack Start resolves the unresolved ancestor chain and marks the target boundary as intended. A `never()` ancestor still wins during initial hydration, so descendants under it remain non-interactive.

## Settings

`Hydrate` accepts these settings:

| Option       | Type                        | Notes                                                                                                                                                                                                       |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `when`       | `HydrationStrategy`         | Required. Use strategy factories from `@tanstack/react-start/hydration`, including `never()` for static initial SSR HTML.                                                                                   |
| `prefetch`   | `HydrationPrefetchStrategy` | Optional split-boundary strategy for preloading the child chunk before hydration. Accepts `load`, `idle`, `visible`, `media`, and `interaction`. `never` and `condition` are not valid prefetch strategies. |
| `split`      | `boolean`                   | Defaults to `true`. Set to literal `false` to disable compiler extraction.                                                                                                                                  |
| `fallback`   | `ReactNode`                 | Client-only loading UI used when the boundary mounts after the app has already hydrated and the child chunk or child `Suspense` is still loading.                                                           |
| `onHydrated` | `() => void`                | Fires once after the boundary has actually hydrated on the client.                                                                                                                                          |

Strategy options:

| Strategy      | Options                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| `idle`        | `{ timeout?: number }`, defaults to `2000`.                                             |
| `visible`     | `{ rootMargin?: string; threshold?: number \| Array<number> }`, default margin `600px`. |
| `media`       | Query string, for example `media('(min-width: 800px)')`.                                |
| `interaction` | `{ events?: supported event or readonly array of supported events }`.                   |
| `condition`   | Boolean or boolean-returning function.                                                  |

Supported interaction events are `auxclick`, `click`, `contextmenu`, `dblclick`, `focusin`, `keydown`, `keyup`, `mousedown`, `mouseenter`, `mouseover`, `mouseup`, `pointerdown`, `pointerenter`, `pointerover`, and `pointerup`.

## Correctness And Updates

Deferred hydration is a performance hint for React's initial hydration work. React may hydrate a deferred boundary earlier than its strategy would normally allow if state, props, context, or store updates outside the boundary require React to reconcile inside it before the gate opens. This preserves correctness and avoids showing stale server HTML after the surrounding app has changed.

`never()` is the exception for initial document hydration. Treat it as intentionally static SSR HTML. Do not rely on parent updates to make a `never()` boundary interactive. If the same boundary mounts later during client-side navigation, it renders normally because no server HTML exists for TanStack Start to keep static.

## Preloading And CSS

TanStack Start does not modulepreload transformed `Hydrate` JavaScript chunks by default. Without `prefetch`, the child chunk loads when the split boundary is ready to render. If that import suspends during client-side navigation or another client-only mount, the boundary's `fallback` is shown.

CSS from split, deferred, and `never()` boundaries remains attached to the route assets because the server-rendered HTML may need those styles before any JavaScript runs. CSS is separate from the JavaScript chunk loaded when a deferred split boundary renders.

## Extraction Limits

Compiler-backed `Hydrate` splitting works by moving the boundary's children into a generated virtual module and rendering them through a lazy component. That gives TanStack Start a separate child chunk to load later, but it also means the compiler must be able to move the JSX safely.

The split boundary must use a statically imported `Hydrate` component from `@tanstack/react-start`. Renaming the import is supported, but dynamic component aliases are not analyzed.

Use the literal prop `split={false}` to opt out of extraction. Dynamic values such as `split={shouldSplit}` cannot be used to opt out at compile time.

These patterns cannot be split:

| Pattern                                  | Why it is rejected                                                                 | What to do instead                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Function-as-children                     | The compiler cannot move a render function and preserve the expected call pattern. | Use `split={false}` or move the rendered UI into a child component.                  |
| Hook calls directly inside extracted JSX | Moving that JSX would move where the hook executes.                                | Move the hook call into a component inside the boundary, then render that component. |
| `this` captures                          | Extracted function components cannot safely preserve class instance context.       | Wrap the UI in a function component or use `split={false}`.                          |
| `super` captures                         | Extracted function components cannot preserve superclass access.                   | Wrap the UI in a function component or use `split={false}`.                          |

This fails because `useThing()` would be moved into the generated component:

```tsx
<Hydrate when={idle()}>
  <p>{useThing()}</p>
</Hydrate>
```

Move the hook into a component instead:

```tsx
function ThingText() {
  const thing = useThing()
  return <p>{thing}</p>
}

export function ProductPage() {
  return (
    <Hydrate when={idle()}>
      <ThingText />
    </Hydrate>
  )
}
```

Values captured from the surrounding component can be passed into the generated child component, but keep the boundary simple. If extraction starts forcing complicated data flow, prefer a named child component and put the logic there.

`fallback` stripping is also intentionally conservative. The server build can strip directly passed fallback UI, inline object-spread fallback UI, and single-use `const` object-spread fallback UI. If fallback props are hidden behind dynamic spreads or shared objects, the compiler may keep them.

For browser-only rendering with no SSR HTML, use `ClientOnly` instead. For route-level SSR control, use [Selective SSR](./selective-ssr.md).
