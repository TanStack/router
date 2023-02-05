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

Literally any library that can **fetch and store data via promises** is supported. Even though we haven't listed them here, you can even get away with using general-purpose state management libraries e.g. [Zustand](https://zustand-demo.pmnd.rs/), [Jotai](https://jotai.org/), [Recoil](https://recoiljs.org/) or [Redux](https://redux.js.org/).

## TanStack Loaders

Just because TanStack Router works with any data-fetching library doesn't mean we'd leave you empty handed! You may not always need all of the features (or you may not want to pay the cost in bundle size) for simpler use-cases. This is why we created [TanStack Loaders](https://tanstack.com/loaders/latest/docs/overview)!
