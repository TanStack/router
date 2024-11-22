---
id: overview
title: TanStack Start Overview
---

TanStack Start is a full-stack React framework powered by TanStack Router. It provides a full-document SSR, streaming, server functions, bundling, and more, powered by TanStack Router, Vinxi, and Vite. It is ready to deploy to your favorite hosting provider!

## Router or Start?

TanStack Router is a powerful, type-safe, and full-featured routing system for React applications. It is designed to handle the beefiest of full-stack routing requirements with ease. TanStack Start builds on top of Router's type system to provide type-safe full-stack APIs that keep you in the fast lane.

What you get with TanStack Router:

- 100% inferred TypeScript support
- Typesafe navigation
- Nested Routing and layout routes
- Built-in Route Loaders w/ SWR Caching
- Designed for client-side data caches (TanStack Query, SWR, etc.)
- Automatic route prefetching
- Asynchronous route elements and error boundaries
- File-based Route Generation
- Typesafe JSON-first Search Params state management APIs
- Path and Search Parameter Schema Validation
- Search Param Navigation APIs
- Custom Search Param parser/serializer support
- Search param middleware
- Route matching/loading middleware

What you get with TanStack Start:

- Full-document SSR
- Streaming
- Server Functions / RPCs
- Bundling
- Deployment
- Full-Stack Type Safety

**In summary, use TanStack Router for client-side routing and TanStack Start for full-stack routing.**

## How does it work?

TanStack Start uses a tool called **Vinxi** to bundle and deploy your application. In fact, this is the same tool that powers Solid Start! With Vinxi, we can do a few things we couldn't do before:

- Provide a unified API for SSR, streaming, and hydration
- Extract server-only code from your client-side code (e.g. server functions)
- Bundle your application for deployment to any hosting provider

## When should I use it?

TanStack Start is perfect for you if you want to build a full-stack React application with the following requirements:

- Full-document SSR & Hydration
- Streaming
- Server Functions / RPCs
- Full-Stack Type Safety
- Robust Routing
- Rich Client-Side Interactivity

## When might I not want to use it?

TanStack Start is not for you if:

- Your site will be 100% static
- Your goal is a server-rendered site with zero JS or minimal client-side interactivity
- You're looking for a React-Server-Component-first framework. (We'll support RSCs soon in our own awesome flavor!)

## How is TanStack Start funded?

TanStack works closely with our partners to provide the best possible developer experience while also providing solutions that work anywhere and are vetted by industry experts. Each of our partners plays a unique role in the TanStack ecosystem:

- **Vercel**
  <a href="https://vercel.com?utm_source=tanstack" alt="Vercel Logo">
  <picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/vercel-dark.svg" style="height: 40px;">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/vercel-light.svg" style="height: 40px;">
  <img alt="Convex logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/vercel-light.svg" style="height: 40px;">
  </picture>
  </a>
  The leading hosting platform for web applications that provides a fast, secure, and reliable environment for deploying your web applications. We work closely with Vercel to ensure that TanStack Start applications not only deploy seamlessly to their platform, but also implement best practices for performance, security, and reliability regardless of where you end up deploying.
- **Clerk**
  <a href="https://go.clerk.com/wOwHtuJ" alt="Clerk Logo">
  <picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/clerk-logo-dark.svg" style="height: 40px;">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/clerk-logo-light.svg" style="height: 40px;">
  <img alt="Convex logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/clerk-logo-light.svg" style="height: 40px;">
  </picture>
  </a>
  The best possible authentication experience for modern web applications, including TanStack Start applications. Clerk provides TanStack Start users with first-class integrations and solutions to auth and collaborates closely with the TanStack team to ensure that TanStack Start provides APIs that are up to date with the latest in auth best practices.
- **Convex**
  <a href="https://convex.dev?utm_source=tanstack" alt="Convex Logo">
  <picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/convex-white.svg" style="height: 40px;">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/convex-color.svg" style="height: 40px;">
  <img alt="Convex logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/convex-color.svg" style="height: 40px;">
  </picture>
  </a>
  A serverless database platform that integrates seamlessly with TanStack Start. Convex is designed to simplify the process of managing your application's data and provides a real-time, scalable, and transactional data backend that works well with TanStack Start applications. Convex also collaborates closely with the TanStack team to ensure that TanStack Start provides APIs that are up to date with the latest in database best practices.
- **Sentry**
  <a href="https://sentry.io?utm_source=tanstack" alt='Sentry Logo'>
  <picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/sentry-wordmark-light.svg" style="height: 60px;">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/sentry-wordmark-dark.svg" style="height: 60px;">
  <img alt="Convex logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/sentry-wordmark-light.svg" style="height: 60px;">
  </picture>
  </a>
  A powerful, full-featured observability platform that integrates seamlessly with TanStack Start. Sentry helps developers monitor and fix crashes in real-time and provides insights into your application's performance and error tracking. Sentry collaborates closely with the TanStack team to ensure that TanStack Start provides APIs that are up to date with the latest in observability best practices.

## Ready to get started?

Proceed to the next page to learn how to install TanStack Start and create your first app!
