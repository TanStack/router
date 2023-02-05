---
title: Data Loading
---

Data loading is a common concern for web applications and is extremely related to routing. When loading any page for your app, it's ideal if all of the async requirements for those routes are fetched and fulfilled as early as possible and in parallel. The router is the best place to coordinate all of these async dependencies as it's usually the only place in your app that knows about where users are headed before content is rendered.

You may be familiar with `getServerSideProps` from Next.js or or `loaders` from Remix/React-Router. Both of these APIs assumes that **the router will store and manage your data**. This approach is great for use cases covered by both of those libraries, but TanStack Router is designed to function a bit differently than you're used to. Let's dig in!

## TanStack Router **does not store your data**.

Most routers that support data fetching will store the data for you in memory on the client. This is fine, but puts a large responsibility and stress on the router to handle [many cross-cutting and complex challenges that come with managing server-data, client-side caches and mutations](https://tanstack.com/query/latest/docs/react/overview#motivation).

## TanStack Router **orchestrates your data fetching**.

Instead of storing your data, TanStack Router is designed to **coordinate** your data fetching. This means that you can use any data fetching library you want, and the router will coordinate the fetching of your data in a way that aligns with your users' navigation.

## What data fetching libraries are supported?

Any data fetching library that supports asynchronous dependencies can be used with TanStack Router. This includes:

- [TanStack Loaders](#tanstack-loaders)
- [TanStack Query](https://tanstack.com/query/latest/docs/react/overview)
- [SWR](https://swr.vercel.app/)
- [RTK Query](https://redux-toolkit.js.org/rtk-query/overview)
- [urql](https://formidable.com/open-source/urql/)
- [Relay](https://relay.dev/)
- [Apollo](https://www.apollographql.com/docs/react/)

Or, even...

- [Zustand](https://zustand-demo.pmnd.rs/)
- [Jotai](https://jotai.org/)
- [Recoil](https://recoiljs.org/)
- [Redux](https://redux.js.org/)

Literally any library that **can return a promise and read/write data** is supported.

## TanStack Loaders

Just because TanStack Router works with any data-fetching library doesn't mean we'd leave you empty handed! You may not always need all of the features of the above libraries (or you may not want to pay their cost in bundle size). This is why we created [TanStack Loaders](https://tanstack.com/loaders/latest/docs/overview)!

## Data Loading Basics

For the following examples, we'll show you the basics of data loading using **TanStack Loaders**, but as we've already mentioned, these same principles can be applied to any state management library worth it's salt. Let's get started!

## The `onLoad` route option

The `onLoad` route option is a function that is called **every time** a route is matched and loaded for:

- Navigating to a new route
- Refreshing the current route
- Preloading

Let's repeat that again. Every time someone navigates to a new route, refreshes the current route, or preloads a route, the matching routes' `onload` functions will be called.

> ⚠️ If you've used Remix or Next.js, you may be used to the idea that data loading only happens for routes on the page that _change_ when navigating. eg. If you were to navigate from '/posts`to`/posts/1`, the `loader`/`getServerSideProps`function for`/posts`would not be called again. This is not the case with TanStack Router. Every route's`onLoad` function will be called every time a route is loaded.

The biggest reason for calling `onLoad` every time is to notify your data loading library that data should be refetched. Obviously, this only works if your data fetching library is designed to handle caching and background refetching. If you're using TanStack Loaders, this is the default behavior.

Here is a simple example of using `onLoad` to fetch data for a route:

```tsx
import { Route } from '@tanstack/react-router'
import { Loader } from '@tanstack/react-loaders'

const postsLoader = new Loader({
  key: 'posts',
  loader: async (params) => {
    const res = await fetch(`/api/posts`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  async onLoad() {
    await postsLoader.load()
  },
  component: () => {
    const posts = postsLoader.state.data

    return <div>{post.title}</div>
  },
})
```
