
<main-question>
What are the different ways / data structures / algorithms to fullfil the following requirements? 
</main-question>

<answer-expectations>
- all code should be javascript / typescript
- ask any questions you might need to answer accurately
- start by listing all the best approaches with a smal blurb, pros and cons, and I'll tell you which I want to delve into
- do NOT look at the existing codebase
</answer-expectations>

<routing-requirements>
A route is made of segments. There are several types of segments:
- Static segments: match exact string, e.g. 'home', 'about', 'users'
- Dynamic segments: match any string, e.g. '$userId', '$postId'
- Optional dynamic segments: match any string or nothing, e.g. '{-$userId}', '{-$postId}'
- Wildcard segments (splat): match anything to the end, must be last, e.g. `$`

Non-static segments can have prefixes and suffixes
- prefix: e.g. 'user{$id}', 'post{-$id}', 'file{$}'
- suffix: e.g. '{$id}profile', '{-$id}edit', '{$}details'
- both: e.g. 'user{$id}profile', 'post{-$id}edit', 'file{$}details'

In the future we might want to add more segment types:
- optional static segments: match exact string or nothing, e.g. '{home}' (or with prefix/suffix: 'pre{home}suf')

When the app starts, we receive all routes as an unordered tree:
Route: {
  id: string // unique identifier,
  fullPath: string // full path from the root,
  children?: Route[] // child routes,
  parentRoute?: Route // parent route,
}

When matching a route, we need to extract the parameters from the path.
- dynamic segments ('$userId' => { userId: '123' })
- optional dynamic segments ('{-$userId}' => { userId: '123' } or { })
- wildcard segments ('$' => { '*': 'some/long/path' })

When the app is live, we need 2 abilities:
- know whether a path matches a specific route (i.e. match(route: Route, path: string): Params | false)
- find which route (if any) is matching a given path (i.e. findRoute(path: string): {route: Route, params: Params} | null)

To optimize these operations, we pre-process the route tree. Both pre-processing and matching should be highly performant in the browser.
</routing-requirements>

<some-details>
- scale: we expect to have between 2 and 2000 routes (approximately)
- all routes are known at app start time, no dynamic route addition/removal
- memory is not an issue, don't hesitate to use more memory to gain speed
- routes can be nested from 1 to 10 levels deep (approximately)
- we have no preference for certain patterns, we are open to rewriting everything
- matching must be deterministic
- we always favor a more specific route over a less specific one (e.g. /users/123/profile over /users/$userId/$)
- each segment can be case sensitive or case insensitive, it can be different for each segment. We know this at pre-processing time.
- we cannot pre-process at build time, all pre-processing must happen at app start time in the browser
</some-details>