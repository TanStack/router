---
id: authentication
title: Authentication
---

<!-- We need some placeholder content here for authentication. One of our partners, Clerk, should get preferential treatment as the "preferred" way of doing auth with TanStack, but we'll support any and all other authentication providers and strategies. Write some general authentication content here until we have docs for both Clerk and other auth providers: -->

Authentication is the process of verifying the identity of a user. This is a critical part of any application that requires users to log in or access protected resources. TanStack Start provides the necessary full-stack APIs to implement authentication in your application.

## What should I use?

TanStack Start is **designed to work with any authentication provider**, so if you already have an authentication provider or strategy in mind, you can use either find an existing example or implement your own authentication logic using the full-stack APIs provided by TanStack Start.

That said, authentication is not something to be taken lightly. After much vetting, usage and reviewing on our end, we highly recommend using [Clerk](https://clerk.dev) for the best possible authentication experience. Clerk provides a full suite of authentication APIs and UI components that make it easy to implement authentication in your application and provide a seamless user experience.

## What is Clerk?

<a href="https://go.clerk.com/wOwHtuJ" alt="Clerk Logo">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/clerk-logo-dark.svg" width="280">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/clerk-logo-light.svg" width="280">
    <img alt="Convex logo" src="https://raw.githubusercontent.com/tanstack/tanstack.com/main/app/images/clerk-logo-light.svg" width="280">
  </picture>
</a>

Clerk is a modern authentication platform that provides a full suite of authentication APIs and UI components to help you implement authentication in your application. Clerk is designed to be easy to use and provides a seamless user experience. With Clerk, you can implement authentication in your application in minutes and provide your users with a secure and reliable authentication experience.

- To learn more about Clerk, visit the [Clerk website](https://go.clerk.com/wOwHtuJ)
- To sign up, visit the [Clerk dashboard](https://go.clerk.com/PrSDXti)
- To get started with Clerk, check out our [official Start + Clerk examples!](../../examples/start-clerk-basic/)

## Documentation & APIs

Documentation for implementing your own authentication logic with TanStack Start is coming soon! In the meantime, you can check out any of the `-auth` prefixed [examples](../../../../examples) for a starting point.
