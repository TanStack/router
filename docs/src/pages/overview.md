---
id: overview
title: Overview
---

React Location is a router for client-side React applications.

Here are some of its core features at a glance:

- Asynchronous routing
  - Promise-based data loaders
  - Asynchronous route elements
  - Threshold-based pending route elements
  - Error boundary route elements
  - Code-splitting
  - Post-render async loader APIs (stale-while-revalidate, external cache integration)
  - Navigation batching with graceful replace/push escalation
- Deeply integrated Search Params API
  - JSON-first Search Params
  - Full `<Link>` and `useNavigate` integrtion
  - Full `cmd+click` support
  - Search Param Immutability w/ Structural Sharing
  - Batched Updates / Functional Updates
  - Route Matching
  - Optional Compression w/ JSURL plugin or your own custom parser/serializer!
- Hooks for everything: Router, Matches, Route Matching, Preloading
- Optional route filtering/ranking
- Optional JSX route definitions
- Prepackaged simple cache implementation for route loader caching
- Easy Integration w/ external caches and storage (eg. React Query, Apollo, SWR, RTKQuery)
- SSR route matching, loading & hydration (coming soon)

## In the beginning...

React Location got its humble beginnings as a wrapper around the long-winded v6 beta release of [React Router](https://reactrouter.com/). Originally, it solved, skirted, and patched a few of the limitations (essentially a majority of the items on the list of features above). Over time, React Location's feature set outgrew the core capabilities of React Router and required full control over the routing experience to achieve its potential.

### Why are Search Params so important?

It's likely that every day, you are faced with the decision of state management in your app. **Where to I put this state?**

Common answers to this question might include:

- Server state? Put it in React Query!
- In-memory app state? Put it in {insert your favorite client-side state manager} (mine is Zustand or Valtio!)
- Persist on the machine? LocalStorage or SessionStorage, of course.

**But did you know you're missing one?! What about the URL!**

All too often I see developers putting state in the wrong places not only because state management is Hard™️, but also because their tools are limiting their decisions.

So, what if storing state in the URL was as easy as storing state in any other first-class state management tool? Would you do it more? Did you know your URLs would then be more sharable, bookmarkable and more consistent across app navigation?

Much how React Query made handling server-state in your React applications a breeze, React Location similarly **unlocks the power of URL search params**.

### How does React Location handle Search Params?

Most applications, even large ones will get away with requiring only a few string-based search query params in the url, probably something like `?page=3` or `?filter-name=tanner`. The main reason you'll find this **state** inside of the URL is because while it may not fit the hierarchical patterns of the pathname section of the URL, it's still very important to the output of a page. Both the ability to consume these search params and manipulate them without restriction is paramount to your app's developer and user experience. Your users should be able to bookmark/copy-paste/share a link from your app and have consistency with the original state of the page.

When you begin to store more state in the URL you will inevitably and naturally want to reach for JSON to store it. Storing JSON state in the URL has its own complications involving:

- Route Matching. Path matching for routes is really only a small part of what a decently designed route tree can do. Being able to match on search params (in its many flavors) should not be considered a "plugin" or afterthought. It should be one of the most integrated and powerful parts of the API.
- Parsing/Serialization. I'm talking about full-customization here; BYO stringifier/parser.
- Immutability & Structural Sharing. This one is tricky to explain, but essentially it will save you from the inevitable infinite side-effect rerenders.
- Compression & Readability. While not out-of-the-box, this is usually desired, so making it simple to get should be as simple as including a library.
- Low-level declarative APIs to manipulate query state (think `<Link>`, `<Navigate>` and `useNavigate`). This is one where most routers can't or won't go. To do this correctly, you have to buy into your search-param APIs whole-sale at the core of the architecture and provide them as a consistent experience through the entire library.

Let's just say React Location doesn't skimp on search params. It handles all of this out of the box and goes the extra mile!

### Asynchronous Navigation

Popularized by frameworks like [Next.js](https://nextjs.org) and now [Remix](https://remix.run), **specifying asynchronous dependencies for routes that can all resolve in parallel before rendering** is quickly becoming table stakes for almost every React Framework out there. It would be nice if Suspense on its own could give us the solution, but without a router to indicate what needs to be pre-loaded, only suspending on render doesn't allow you to avoid waterfal suspense requests.

This capability of knowing everything that needs to be fetched up front before navigating is being exploreded heavily in SSR frameworks, but not in client-side apps. React Location's goal is to provide that same first-class support for specifying arbitrary asynchronous dependencies for your routes while asynchronously suspending navigation rendering until these dependencies are met.

To do this properly, routing and navigation needs to be designed from the ground up to be **fully asynchronous**. The following features in React Location are first-class and native to the entire routing architecture:

- Scheduling
- Batching
- Data Loading
- Asynchronous Elements
- Pending states
- Error handling
- Preloading
- Caching

### So much more!

Enough overview, there's so much more to do with React Location. Hit that next button and let's get started!
