<img src="https://static.scarf.sh/a.png?x-pxid=d988eb79-b0fc-4a2b-8514-6a1ab932d188" />

# ⚛️ React-Location (Beta)

Enterprise Routing for React

<a href="https://twitter.com/intent/tweet?button_hashtag=TanStack" target="\_parent">
  <img alt="#TanStack" src="https://img.shields.io/twitter/url?color=%2308a0e9&label=%23TanStack&style=social&url=https%3A%2F%2Ftwitter.com%2Fintent%2Ftweet%3Fbutton_hashtag%3DTanStack">
</a><a href="https://github.com/tannerlinsley/react-location/actions?query=workflow%3A%22react-location+tests%22">
<img src="https://github.com/tannerlinsley/react-location/workflows/react-location%20tests/badge.svg" />
</a><a href="https://npmjs.com/package/react-location" target="\_parent">
  <img alt="" src="https://img.shields.io/npm/dm/react-location.svg" />
</a><a href="https://bundlephobia.com/result?p=react-location@next" target="\_parent">
  <img alt="" src="https://badgen.net/bundlephobia/minzip/react-location@next" />
</a><a href="#badge">
    <img alt="semantic-release" src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg">
  </a><a href="https://github.com/tannerlinsley/react-location/discussions">
  <img alt="Join the discussion on Github" src="https://img.shields.io/badge/Github%20Discussions%20%26%20Support-Chat%20now!-blue" />
</a><a href="https://bestofjs.org/projects/react-location"><img alt="Best of JS" src="https://img.shields.io/endpoint?url=https://bestofjs-serverless.now.sh/api/project-badge?fullName=tannerlinsley%2Freact-location%26since=daily" /></a><a href="https://github.com/tannerlinsley/react-location" target="\_parent">
  <img alt="" src="https://img.shields.io/github/stars/tannerlinsley/react-location.svg?style=social&label=Star" />
</a><a href="https://twitter.com/tannerlinsley" target="\_parent">
  <img alt="" src="https://img.shields.io/twitter/follow/tannerlinsley.svg?style=social&label=Follow" />
</a>

Enjoy this library? Try the entire [TanStack](https://tanstack.com)! [React Query](https://github.com/tannerlinsley/react-query), [React Table](https://github.com/tannerlinsley/react-table), [React Form](https://github.com/tannerlinsley/react-form), [React Charts](https://github.com/tannerlinsley/react-charts)

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Intro](#intro)
  - [URL Search/Query State](#url-searchquery-state)
  - [Deep-Route Suspense & Navigational Transactions](#deep-route-suspense--navigational-transactions)
  - [But Tanner, why didn't you just PR/plugin/proxy/add this functionality into an existing router?](#but-tanner-why-didnt-you-just-prpluginproxyadd-this-functionality-into-an-existing-router)
- [Features](#features)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
  - [ReactLocation](#reactlocation)
  - [ReactLocationProvider](#reactlocationprovider)
  - [Routes](#routes)
  - [useRoutes](#useroutes)
  - [useRoute](#useroute)
  - [Link](#link)
  - [Navigate](#navigate)
  - [useNavigate](#usenavigate)
  - [useMatch](#usematch)
  - [SSR](#ssr)
  - [Inspiration](#inspiration)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Intro

React Location started as a solution to small roadblocks I experienced in the mostly wonderful APIs of [React Router](https://reactrouter.com/) and the [Next.js Router](https://nextjs.org/docs/api-reference/next/router).

### URL Search/Query State

Most applications, even large ones will get away with requiring only a few string-based search query params in the url, probably something like `?page=3` or `?filter-name=tanner`. The main reason you'll find this **state** inside of the URL is because it's linkability and shareability is very important. Your users should be able to bookmark/copy-paste/share a link from your app and have consistency with the original state of the page.

When you begin to store more state in the URL you will inevitably and naturally want to reach for JSON to store it. Storing JSON state in the URL has it's own complications involving:

- Parsing/Serialization
- Immutability & Structural Sharing
- Compression & Readablity
- Powerful Declarative & Imperative APIs to manipulate query state

React Location handles all of this out of the box.

### Client-side Navigational Suspense

Popularized by frameworks like [Next.js](https://nextjs.org) and [Remix](https://remix.run), **specifying asynchronous dependencies for routes that can all resolve in parallel before rendering** has become an expectation of almost every SSR-based routing APIs. I believe this capability, while intuitive in an SSR environment, is not exclusive to it and definitely has a place in the client-side routing world.

React Location provides first-class support for specifying arbitrary asynchronous dependencies for your routes and will asynchronously suspend navigation rendering until these dependencies are met.

Don't like the initial fallback showing on the client while mouting? React Location provides the ability to both:

- Match and pre-load route data during SSR and also
- Supply pre-loaded route data during rehydration

### But Tanner, why didn't you just PR/plugin/proxy/add this functionality into an existing router?

I tried so hard, I promise! I gave my best and most fervent attempt to proxy React Router v6 (argubly the only worthy router in the ecosystem to try this with) to achieve these features, but after hitting the ceiling on its public API and quite literally proxying and re-exporting every single function/variable/type from the library, I realized that unless the core internals of React Router were exposed (which would require yet another breaking change on its part) the idea was dead on arrival. Only then, did I know it was time to design a new router from the ground up with support for the features I needed.

## Features

- Deeply integrated URL Search API ()
  - JSON
  - Immutable w/ Structural Sharing
  - Compression
  - Types
- Deep-Route Loaders (for data, images, assets, readiness, etc.)
- Asynchronous Routes (module-splitting, dynamic routes)

### Inspiration

All of these libraries offered a lot of guidance and design inspiration for this library:

- [`React Router`](https://reacttraining.com/react-router/)
- [`Next.js`](https://nextjs.org)

<!-- Blah Blah Blah >
