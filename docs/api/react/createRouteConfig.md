---
id: route
title: route
---

Use the 'route' to create route to pass to your Route Provider.

```tsx
import { Route } from '@tanstack/router'

const router = new Route()
```

'route' takes the following options:

**Options**

- `options: RouterOptions<TRouteConfig, TRouterContext>`

  - **Required**

  - `action: ActionFn<>`

    An asynchronous function made available to the route for performing asynchronous or mutative actions that might invalidate the route's data.

  - `beforeLoad:`

    This async function is called before a route is loaded.
    If an error is thrown here, the route's loader will not be called.
    If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onLoadError` function.
    If thrown during a preload event, the error will be logged to the console.

  - `caseSensitive: boolean`

    'caseSensitive' takes a boolean `true | false` , which defines if you want your routes to be case sensitive or not.

  - `component: RouteComponent<{}>`

    This takes in a JSX component which you want to render for the particular route path:

    ```tsx
    const rootRouter = route({
      component: () => {
        return <div>// your data here</div>
      },

      // you can also pass in the component like this
      // component: Home
    })
    ```

  - `errorComponent:RouteComponent<{error, info}>`

    This renders when the route has resulted in an error:

    ```tsx
    const rootRouter = route({
      errorComponent: (error, info) => {
        return (
          <div>
            // your data here
            <h1>{error}</h1>
            <h1>{info}</h1>
          </div>
        )
      },
    })
    ```

  - `onLoad: LoaderFn<AnyLoaderData, {}, {}>`

    This is used when you want you load data in your route which can later be read using 'useLoaderInstance' or 'useMatch'

    ```tsx
    const rootRouter = route({
      onLoad: async () => {
        const posts = await axios
          .get<PostType[]>('https://jsonplaceholder.typicode.com/posts')
          .then((r) => r.data.slice(0, 10))

        return { posts }
      },
    })
    ```

  - `loaderGcMaxAge: number`

    The max age to cache the loader data for this route in milliseconds from the time of route inactivity before it is garbage collected.

  - `loaderMaxAge: number`

    The max age to consider loader data fresh (not-stale) for this route in milliseconds from the time of fetch
    Defaults to 0. Only stale loader data is refetched.

  - `meta: RouteMeta`
    An object of whatever you want! This object is accessible anywhere matches are.
  - `onLoadError: ((err: any) => void) |          undefined`
    This function will be called if the route's loader throws an error **during an attempted navigation**.
    If you want to redirect due to an error, call `router.navigate()` from within this function.
    ```tsx
    const rootRouter = route({
      onLoadError: (err) => {
        //redirect using router.navigate()
        router.navigate('/')
      },
    })
    ```
  - `onLoaded: ((matchContext: {params: {},
search: {}}) => void | ((match: {params: {};
search: {};
}) => void) | undefined) | undefined `

                                    This function is called when moving from an inactive state to an active one. Likewise, when moving from an active to an inactive state, the return function (if provided) is called.

  - `onTransition: ((match: {
params: {};
search: {};
}) => void) | undefined `

                                    This function is called when the route remains active from one transition to the next.

  - `parseParams: ((rawParams: Record<never, string>) => Record<never, string>) | undefined`

    Parse params optionally receives path params as strings and returns them in a parsed format (like a number or boolean)

  - `path:`

    The path to match (relative to the nearest parent `Route` component or root basepath)

  - `pendingComponent: RouteComponenet<{}>`

    the content to be rendered as the fallback content until the route is ready to render

  - `postSearchFilters:SearchFilter<{}, {}>[]`

    Filter functions that can manipulate search params _after_ they are passed to links and navigate calls that match this route.

  - `preSearchFilters:SearchFilter<{}, {}>[]`

    Filter functions that can manipulate search params _before_ they are passed to links and navigate calls that match this route.

  - `stringifyParams:((params: Record<never, string>) => Record<never, string>) | undefined`

    stringify params optionally receives path params and returns them in a string format

  - `validateSearch:SearchSchemaValidator<AnySearchSchema, {}> | undefined`

    validateSearch takes in the validation schema to validate the search params , you can also pass zod validation schema as a validator.

**Returns**

- `router: Router<TRouteConfig, TRoutesInfo, TRouterContext>`
