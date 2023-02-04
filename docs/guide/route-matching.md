---
title: Route Matching
---

Route matching follows a consistent and predictable pattern. This guide will explain how route trees are matched.

When TanStack Router creates your router, all of your routes are automatically resorted to match the most specific routes first. This means that regardless of the order your route tree is defined, routes will always be sorted to this order:

- Index Routes
- Static Routes (longest to shortest)
- Dynamic Routes (longest to shortest)
- Splat/Wildcard Routes

Consider the following pseudo route tree:

```
Root
  - blog
    - $postId
    - /
    - new
  - /
  - *
  - about
```

After sorting, this route tree will become:

```
Root
  - /
  - blog
    - /
    - new
    - $postId
  - about
  - *
```

This final order represents the order in which routes will be matched based on specificity.

Using that route tree, let's follow the matching process for a few different URLs:

- `/blog`
  ```
  Root 👍
    ✅ blog 👍
      ✅ /
      - new
      - $postId
    - about
    - /
    - *
  ```
- `/blog/my-post`
  ```
  Root 👍
    ✅ blog 👍
      ❌ /
      ❌ new
      ✅ $postId
    - about
    - /
    - *
  ```
- `/`
  ```
  Root 👍
    ❌ blog
      ❌ /
      ❌ new
      ❌ $postId
    ❌ about
    ✅ /
    - *
  ```
- `/not-a-route`
  ```
  Root 👍
    - blog
      - /
      - new
      - $postId
    ❌ about
    ❌ /
    ✅ *
  ```
