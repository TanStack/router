---
id: Router CLI
title: Router CLI (Route Generation)
---

After installing the `@tanstack/router-cli` package via NPM, the `tsr` CLI command (stands for `TanStack Router`) will be available. It is designed to automatically generate route configurations from file-based route structure. Users can either generate the routes manually or continuously watch the project and regenerate routes accordingly. The CLI supports both nested and flat route hierarchies simultaneously, providing flexibility in organizing route files.

## Installation

```bash
npm i @tanstack/router-cli
```

## Configuration

The CLI can be configured via a `tsr.config.json` file in the project's root directory.

### Options

- **`routeFilePrefix`**: (Optional) If set, only route files and directories that start with this string will be considered for routing.
- **`routeFileIgnorePrefix`**: (Optional, **Defaults to `-`**) Route files and directories that start with this string will be ignored. By default this is set to `-` to allow for the use of directories to house related files that do not contain any route files.
- **`routesDirectory`**: (Required) The directory containing the routes relative to the cwd.
- **`generatedRouteTree`**: (Required) The path to the file where the generated route tree will be saved, relative to the cwd.
- **`quoteStyle`**: (Optional, **Defaults to `single`**) whether to use `single` or `double` quotes when writing the route ids in `new FileRoute()`

## Example

A typical configuration file usually looks something like this:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts"
}
```

## Commands

The following commands are available:

### `generate`

Generates the routes for a project based on the provided configuration.

**Usage:**

```bash
tsr generate
```

### `watch`

Continuously watches the specified directories and regenerates routes as needed.

**Usage:**

```bash
tsr watch
```

## File Naming Conventions

- **`$` Token**: Routes segments with the `$` token are parameterized and will extract the value from the URL pathname as a route `param`.
- **`_` Prefix**: Routes segments with this prefix behave normally but don't contribute the prefixed part to the URL pathname.
- **`_` Suffix**: Routes segments with this suffix will only be wrapped with parent routes down to the path with the underscore prefix (but not including it).

## File Structure

TSR CLI's generator is designed with an exceptional degree of flexibility, capable of accommodating both flat and nested file structures, or even a combination of the two without any additional configuration. In a flat structure, all files reside at the same level, with specific prefixes and suffixes denoting their relationships and behaviors. Conversely, a nested structure organizes related files into directories, using nesting to illustrate relationships. Both approaches are valuable, so the generator automatically supports mixed configurations where flat and nested structures coexist within the same route tree. This adaptability ensures that developers have complete control over their route organization, allowing for the customization of the routing structure to align seamlessly with various project needs and preferences.

Both of the following configurations will result in a route path of `/posts/$postId/edit`:

- Flat Syntax: `posts.$postId.edit.tsx`
- Nested Syntax:
  - `posts` (directory)
    - `$postId` (directory)
      - `edit.tsx` (file)

### Examples

The following examples illustrate how the CLI will interpret various file structures.

#### Mixed Configuration

By default, mixed flat and nested file-naming conventions are supported and encouraged. This allows developers to organize their routes in a way that makes sense for their project, without being forced to choose between a flat or nested structure.

```
\__root.tsx
\_layout.tsx
\_layout
layout-a.tsx
layout-b.tsx
index.tsx
posts_.$postId.deep.tsx
posts.tsx
users
  index.tsx
  $userId.tsx
  $userId
    profile.tsx
settings.index.tsx
settings.$settingId.tsx
notifications.tsx
notifications.$notifId.tsx
```

#### Flat Configuration

If you prefer a totally flat structure, you can use only `.`s to denote path hierarchy.

```
posts.tsx
__root.tsx
_layout.layout-a.tsx
_layout.layout-c.tsx
_layout.tsx
index.tsx
posts.$postId_.deep.tsx
posts.$postId.tsx
posts.index.tsx
users.tsx
users.$userId.tsx
users.$userId.profile.tsx
settings.tsx
settings.profile.tsx
settings.notifications.tsx
```

#### Nested Configuration

If you prefer a totally nested structure, you can strictly use directories to denote path hierarchy.

```
__root.tsx
_layout.tsx
_layout
  layout-a.tsx
  layout-b.tsx
index.tsx
posts_.$postId.deep.tsx
posts.tsx
posts
  index.tsx
  $postId.tsx
users
  index.tsx
  $userId.tsx
  $userId
    profile.tsx
settings
  index.tsx
  profile.tsx
  notifications.tsx
```

## Route Inclusion / Exclusion

Via the `routeFilePrefix` and `routeFileIgnorePrefix` options, the CLI can be configured to only include files and directories that start with a specific prefix, or to ignore files and directories that start with a specific prefix. This is especially useful when mixing non-route files with route files in the same directory, or when using a flat structure and wanting to exclude certain files from routing.

## Route Inclusion Example

To only consider files and directories that start with `~` for routing, the following configuration can be used:

> 🧠 A prefix of `~` is generally recommended when using this option. Not only is this symbol typically associated with the home-folder navigation in unix-based systems, but it is also a valid character for use in filenames and urls that will typically force the file to the top of a directory for easier visual indication of routes.

```json
{
  "routeFilePrefix": "~",
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts"
}
```

With this configuration, the `Posts.tsx`, `Post.tsx`, and `PostEditor.tsx` files will be ignored during route generation.

```
~__root.tsx
~posts.tsx
~posts
  ~index.tsx
  ~$postId.tsx
  ~$postId
    ~edit.tsx
    PostEditor.tsx
  Post.tsx
Posts.tsx
```

It's also common to use directories to house related files that do not contain any route files:

```
~__root.tsx
~posts.tsx
~posts
  ~index.tsx
  ~$postId.tsx
  ~$postId
    ~edit.tsx
    components
      PostEditor.tsx
  components
    Post.tsx
components
  Posts.tsx
utils
  Posts.tsx
```

## Route Exclusion Example

To ignore files and directories that start with `-` for routing, the following configuration can be used:

> 🧠 A prefix of `-` is generally recommended when using this option since the minus symbol is typically associated with removal or exclusion.

```json
{
  "routeFileIgnorePrefix": "-",
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts"
}
```

With this configuration, the `Posts.tsx`, `Post.tsx`, and `PostEditor.tsx` files will be ignored during route generation.

```
__root.tsx
posts.tsx
posts
  index.tsx
  $postId.tsx
  $postId
    edit.tsx
    -PostEditor.tsx
  -Post.tsx
-Posts.tsx
```

It's also common to use ignored directories to house related files that do not contain any route files:

```
__root.tsx
posts.tsx
posts
  index.tsx
  $postId.tsx
  $postId
    edit.tsx
    -components
      PostEditor.tsx
  -components
    Post.tsx
-components
  Posts.tsx
-utils
  Posts.tsx
```

# Experimental Features

## `unstable_codeSplitting`

> ⚠️ **This feature is experimental and subject to change.**

The `unstable_codeSplitting` option enables auto code splitting for routes and requires a bit more file-wrangling. To use it, add the `future.unstable_codeSplitting` option to your `tsr.config.json` file:

```json
{
  ...
  "future": {
    "unstable_codeSplitting": true
  }
}
```

### Splitting a route's component

To split a route's component, copy the component and it's dependencies into a new file with the same name as the route file, but with a `.component.tsx` suffix, then export your component from that file under the named export `component`.

For example, if you have a route file named `posts.tsx`, you would create a new file named `posts.component.tsx` and move the component and it's dependencies into that file.

#### Before

```tsx
// posts.$postId.tsx

import { Route } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = new Route({
  loader: fetchPosts,
  component: Posts,
})

function MyComponent () {
  ...
}
```

#### After

```tsx
// posts.tsx

import { Route } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = new Route({
  loader: fetchPosts,
})
```

```tsx
// posts.component.tsx

export const component = function MyComponent () {
  ...
}
```

### Splitting a route's loader

To split a route's loader, copy the loader into a new file with the same name as the route file, but with a `.loader.ts` suffix, then export your loader from that file under the named export `loader`.

For example, if you have a route file named `posts.tsx`, you would create a new file named `posts.loader.ts` and move the loader into that file.

#### Before

```tsx
// posts.tsx

import { Route } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = new Route({
  loader: fetchPosts,
  component: Posts,
})

function MyComponent () {
  ...
}
```

#### After

```tsx
// posts.tsx

import { Route } from '@tanstack/react-router'

export const Route = new Route({
  component: Posts,
})
```

```tsx
// posts.loader.ts

import { fetchPosts } from './api'

export const loader = fetchPosts
```

### Encapsulating a route's files into a directory

To encapsulate a route's files into a directory, you can move the route file itself into a `.route` file within a directory with the same name as the route file. For example, if you have a route file named `posts.tsx`, you would create a new directory named `posts` and move the `posts.tsx` file into that directory, renaming it to `index.route.tsx`.

#### Before

- `posts.tsx`
- `posts.component.tsx`
- `posts.loader.ts`

#### After

- `posts`
  - `route.tsx`
  - `component.tsx`
  - `loader.ts`
