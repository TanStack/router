/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import * as Solid from 'solid-js'
import { render } from 'solid-js/web'
import {
  ErrorComponent,
  Link,
  MatchRoute,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  retainSearchParams,
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
} from '@tanstack/solid-router'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'
import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useMutation,
  useQuery,
} from '@tanstack/solid-query'
import { SolidQueryDevtools } from '@tanstack/solid-query-devtools'
import { z } from 'zod'
import {
  fetchInvoiceById,
  fetchInvoices,
  fetchUserById,
  fetchUsers,
  patchInvoice,
  postInvoice,
} from './mockTodos'
import type { Invoice } from './mockTodos'
import './styles.css'

//

type UsersViewSortBy = 'name' | 'id' | 'email'

const invoicesQueryOptions = () =>
  queryOptions({
    queryKey: ['invoices'],
    queryFn: () => fetchInvoices(),
  })

const invoiceQueryOptions = (invoiceId: number) =>
  queryOptions({
    queryKey: ['invoices', invoiceId],
    queryFn: () => fetchInvoiceById(invoiceId),
  })

const usersQueryOptions = ({
  filterBy,
  sortBy,
}: {
  filterBy?: string
  sortBy?: UsersViewSortBy
}) =>
  queryOptions({
    queryKey: ['users', { filterBy, sortBy }],
    queryFn: () =>
      fetchUsers({
        filterBy,
        sortBy,
      }),
  })

const userQueryOptions = (userId: number) =>
  queryOptions({
    queryKey: ['users', userId],
    queryFn: async () => {
      const user = await fetchUserById(userId)
      if (!user) {
        throw new Error('User not found.')
      }
      return user
    },
  })

const useCreateInvoiceMutation = () => {
  return useMutation(() => ({
    mutationKey: ['invoices', 'create'],
    mutationFn: postInvoice,
    onSuccess: () => queryClient.invalidateQueries(),
  }))
}

const useUpdateInvoiceMutation = (invoiceId: number) => {
  return useMutation(() => ({
    mutationKey: ['invoices', 'update', invoiceId],
    mutationFn: patchInvoice,
    onSuccess: () => queryClient.invalidateQueries(),
    gcTime: 1000 * 10,
  }))
}

function RouterSpinner() {
  const isLoading = useRouterState({ select: (s) => s.status === 'pending' })
  return <Spinner show={isLoading()} />
}

// Routes

// Build our routes. We could do this in our component, too.
const rootRoute = createRootRouteWithContext<{
  auth: Auth
  queryClient: QueryClient
}>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <div class={`min-h-screen flex flex-col`}>
        <div class={`flex items-center border-b gap-2`}>
          <h1 class={`text-3xl p-2`}>Kitchen Sink</h1>
          {/* Show a global spinner when the router is transitioning */}
          <div class={`text-3xl`}>
            <RouterSpinner />
          </div>
        </div>
        <div class={`flex-1 flex`}>
          <div class={`divide-y w-56`}>
            {(
              [
                ['/', 'Home'],
                ['/dashboard', 'Dashboard'],
                ['/expensive', 'Expensive'],
                ['/route-a', 'Pathless Layout A'],
                ['/route-b', 'Pathless Layout B'],
                ['/profile', 'Profile'],
                ['/login', 'Login'],
              ] as const
            ).map(([to, label]) => {
              return (
                <div>
                  <Link
                    to={to}
                    activeOptions={
                      {
                        // If the route points to the root of it's parent,
                        // make sure it's only active if it's exact
                        // exact: to === '.',
                      }
                    }
                    preload="intent"
                    class={`block py-2 px-3 text-blue-700`}
                    // Make "active" links bold
                    activeProps={{ class: `font-bold` }}
                  >
                    {label}
                  </Link>
                </div>
              )
            })}
          </div>
          <div class={`flex-1 border-l`}>
            {/* Render our first route match */}
            <Outlet />
          </div>
        </div>
      </div>
      <TanStackRouterDevtools position="bottom-right" />
      <SolidQueryDevtools buttonPosition="top-right" />
    </>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

function IndexComponent() {
  return (
    <div class={`p-2`}>
      <div class={`text-lg`}>Welcome Home!</div>
      <hr class={`my-2`} />
      <Link
        to={invoiceRoute.to}
        params={{
          invoiceId: 3,
        }}
        class={`py-1 px-2 text-xs bg-blue-500 text-white rounded-full`}
      >
        1 New Invoice
      </Link>
      <hr class={`my-2`} />
      <div class={`max-w-xl`}>
        As you navigate around take note of the UX. It should feel
        suspense-like, where routes are only rendered once all of their data and
        elements are ready.
        <hr class={`my-2`} />
        To exaggerate async effects, play with the artificial request delay
        slider in the bottom-left corner.
        <hr class={`my-2`} />
        The last 2 sliders determine if link-hover preloading is enabled (and
        how long those preloads stick around) and also whether to cache rendered
        route data (and for how long). Both of these default to 0 (or off).
      </div>
    </div>
  )
}

const dashboardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'dashboard',
  component: DashboardLayoutComponent,
})

function DashboardLayoutComponent() {
  return (
    <>
      <div class="flex items-center border-b">
        <h2 class="text-xl p-2">Dashboard</h2>
      </div>
      <div class="flex flex-wrap divide-x">
        {(
          [
            ['/dashboard', 'Summary', true],
            ['/dashboard/invoices', 'Invoices'],
            ['/dashboard/users', 'Users'],
          ] as const
        ).map(([to, label, exact]) => {
          return (
            <Link
              to={to}
              activeOptions={{ exact }}
              activeProps={{ class: `font-bold` }}
              class="p-2"
            >
              {label}
            </Link>
          )
        })}
      </div>
      <hr />
      <Outlet />
    </>
  )
}

const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/',
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(invoicesQueryOptions()),
  component: DashboardIndexComponent,
})

function DashboardIndexComponent() {
  const invoicesQuery = useQuery(() => invoicesQueryOptions())
  const invoices = invoicesQuery.data

  return (
    <div class="p-2">
      <div class="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices?.length} total invoices</strong>.
      </div>
    </div>
  )
}

const invoicesLayoutRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: 'invoices',
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(invoicesQueryOptions()),
  component: InvoicesLayoutComponent,
})

function InvoicesLayoutComponent() {
  const invoicesQuery = useQuery(() => invoicesQueryOptions())
  const invoices = invoicesQuery.data
  // const updateInvoiceMutation = useUpdateInvoiceMutation()
  // const createInvoiceMutation = useCreateInvoiceMutation()

  return (
    <div class="flex-1 flex">
      {/* {routerTransitionIsPending ? 'pending' : 'null'} */}
      <div class="divide-y w-48">
        {invoices?.map((invoice) => {
          // const updateSubmission = updateInvoiceMutation.submissions.find(
          //   (d) => d.variables?.id === invoice.id,
          // )

          // if (updateSubmission) {
          //   invoice = {
          //     ...invoice,
          //     ...updateSubmission.variables,
          //   }
          // }

          return (
            <div>
              <Link
                to="/dashboard/invoices/$invoiceId"
                params={{
                  invoiceId: invoice.id,
                }}
                preload="intent"
                class="block py-2 px-3 text-blue-700"
                activeProps={{ class: `font-bold` }}
              >
                <pre class="text-sm">
                  #{invoice.id} - {invoice.title.slice(0, 10)}{' '}
                  {/* {updateSubmission ? (
                      <Spinner />
                    ) : ( */}
                  <MatchRoute
                    to={invoiceRoute.to}
                    params={{
                      invoiceId: invoice.id,
                    }}
                    pending
                  >
                    {(match) => <Spinner show={!!match} wait="delay-50" />}
                  </MatchRoute>
                  {/* )} */}
                </pre>
              </Link>
            </div>
          )
        })}
        {/* {createSubmissions.map((action) => (
            <div key={action.submittedAt}>
              <a href="#" class="block py-2 px-3 text-blue-700">
                <pre class="text-sm">
                  #<Spinner /> - {action.variables.title?.slice(0, 10)}
                </pre>
              </a>
            </div>
          ))} */}
      </div>
      <div class="flex-1 border-l">
        <Outlet />
      </div>
    </div>
  )
}

const invoicesIndexRoute = createRoute({
  getParentRoute: () => invoicesLayoutRoute,
  path: '/',
  component: InvoicesIndexComponent,
})

function InvoicesIndexComponent() {
  const createInvoiceMutation = useCreateInvoiceMutation()

  return (
    <>
      <div class="p-2">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const formData = new FormData(event.target as HTMLFormElement)
            createInvoiceMutation.mutate({
              title: formData.get('title') as string,
              body: formData.get('body') as string,
            })
          }}
          class="space-y-2"
        >
          <div>Create a new Invoice:</div>
          <InvoiceFields invoice={{} as Invoice} />
          <div>
            <button
              class="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
              disabled={createInvoiceMutation.status === 'pending'}
            >
              {createInvoiceMutation.status === 'pending' ? (
                <>
                  Creating <Spinner />
                </>
              ) : (
                'Create'
              )}
            </button>
          </div>
          {createInvoiceMutation.status === 'success' ? (
            <div class="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Created!
            </div>
          ) : createInvoiceMutation.status === 'error' ? (
            <div class="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Failed to create.
            </div>
          ) : null}
        </form>
      </div>
    </>
  )
}

const invoiceRoute = createRoute({
  getParentRoute: () => invoicesLayoutRoute,
  path: '$invoiceId',
  params: {
    parse: (params) => ({
      invoiceId: z.number().int().parse(Number(params.invoiceId)),
    }),
    stringify: ({ invoiceId }) => ({ invoiceId: `${invoiceId}` }),
  },
  validateSearch: (search) =>
    z
      .object({
        showNotes: z.boolean().optional(),
        notes: z.string().optional(),
      })
      .parse(search),
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(
      invoiceQueryOptions(opts.params.invoiceId),
    ),
  component: InvoiceComponent,
})

function InvoiceComponent() {
  const params = invoiceRoute.useParams()
  const search = invoiceRoute.useSearch()
  const navigate = useNavigate({ from: invoiceRoute.fullPath })
  const invoiceQuery = useQuery(() =>
    invoiceQueryOptions(params().invoiceId),
  )
  const invoice = invoiceQuery.data
  const updateInvoiceMutation = useUpdateInvoiceMutation(params().invoiceId)
  const [notes, setNotes] = Solid.createSignal(search().notes ?? '')

  Solid.createEffect(() => {
    navigate({
      search: (old: any) => ({
        ...old,
        notes: notes() ? notes() : undefined,
      }),
      replace: true,
      params: true,
    })
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const formData = new FormData(event.target as HTMLFormElement)
        updateInvoiceMutation.mutate({
          id: invoice!.id,
          title: formData.get('title') as string,
          body: formData.get('body') as string,
        })
      }}
      class="p-2 space-y-2"
    >
      <InvoiceFields
        invoice={invoice!}
        disabled={updateInvoiceMutation.status === 'pending'}
      />
      <div>
        <Link
          search={(old: any) => ({
            ...old,
            showNotes: old.showNotes ? undefined : true,
          })}
          class="text-blue-700"
          from={invoiceRoute.fullPath}
          params={true}
        >
          {search().showNotes ? 'Close Notes' : 'Show Notes'}{' '}
        </Link>
        {search().showNotes ? (
          <>
            <div>
              <div class="h-2" />
              <textarea
                value={notes()}
                onChange={(e) => {
                  setNotes(e.target.value)
                }}
                rows={5}
                class="shadow w-full p-2 rounded"
                placeholder="Write some notes here..."
              />
              <div class="italic text-xs">
                Notes are stored in the URL. Try copying the URL into a new tab!
              </div>
            </div>
          </>
        ) : null}
      </div>
      <div>
        <button
          class="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
          disabled={updateInvoiceMutation.status === 'pending'}
        >
          Save
        </button>
      </div>
      {updateInvoiceMutation.variables?.id === invoice?.id ? (
        <div>
          {updateInvoiceMutation.status === 'success' ? (
            <div class="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Saved!
            </div>
          ) : updateInvoiceMutation.status === 'error' ? (
            <div class="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
              Failed to save.
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

const usersLayoutRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: 'users',
  validateSearch: z.object({
    usersView: z
      .object({
        sortBy: z.enum(['name', 'id', 'email']).optional(),
        filterBy: z.string().optional(),
      })
      .optional(),
  }).parse,
  search: {
    // Retain the usersView search param while navigating
    // within or to this route (or it's children!)
    middlewares: [retainSearchParams(['usersView'])],
  },
  loaderDeps: ({ search }) => ({
    filterBy: search.usersView?.filterBy,
    sortBy: search.usersView?.sortBy,
  }),
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(usersQueryOptions(opts.deps)),
  component: UsersComponent,
})

function UsersComponent() {
  const navigate = useNavigate({ from: usersLayoutRoute.fullPath })
  const search = usersLayoutRoute.useSearch()
  const usersQuery = useQuery(() =>
    usersQueryOptions(usersLayoutRoute.useLoaderDeps()),
  )
  const users = usersQuery.data
  const sortBy = Solid.createMemo(() => search().usersView?.sortBy ?? 'name')
  const filterBy = Solid.createMemo(() => search().usersView?.filterBy)

  const [filterDraft, setFilterDraft] = Solid.createSignal(filterBy() ?? '')

  Solid.createEffect(() => {
    setFilterDraft(filterBy() ?? '')
  })

  const sortedUsers = Solid.createMemo(() => {
    if (!users) return []

    return !sortBy
      ? users
      : [...users].sort((a: any, b: any) => {
          return a[sortBy()] > b[sortBy()] ? 1 : -1
        })
  })

  const filteredUsers = Solid.createMemo(() => {
    if (!filterBy()) return sortedUsers()

    return sortedUsers().filter((user) =>
      user.name.toLowerCase().includes(filterBy()?.toLowerCase() ?? ''),
    )
  })

  const setSortBy = (sortBy: UsersViewSortBy) =>
    navigate({
      search: (old: any) => {
        return {
          ...old,
          usersView: {
            ...(old.usersView ?? {}),
            sortBy,
          },
        }
      },
      replace: true,
    })

  Solid.createEffect(() => {
    navigate({
      search: (old: any) => {
        return {
          ...old,
          usersView: {
            ...old.usersView,
            filterBy: filterDraft() || undefined,
          },
        }
      },
      replace: true,
    })
  }, [filterDraft])

  return (
    <div class="flex-1 flex">
      <div class="divide-y">
        <div class="py-2 px-3 flex gap-2 items-center bg-gray-100 dark:bg-gray-800">
          <div>Sort By:</div>
          <select
            value={sortBy()}
            onChange={(e) => setSortBy(e.target.value as UsersViewSortBy)}
            class="flex-1 border p-1 px-2 rounded"
          >
            {['name', 'id', 'email'].map((d) => {
              return <option value={d} children={d} />
            })}
          </select>
        </div>
        <div class="py-2 px-3 flex gap-2 items-center bg-gray-100 dark:bg-gray-800">
          <div>Filter By:</div>
          <input
            value={filterDraft()}
            onChange={(e) => setFilterDraft(e.target.value)}
            placeholder="Search Names..."
            class="min-w-0 flex-1 border p-1 px-2 rounded"
          />
        </div>
        {filteredUsers().map((user) => {
          return (
            <div>
              <Link
                to="/dashboard/users/user"
                search={{
                  userId: user.id,
                }}
                class="block py-2 px-3 text-blue-700"
                activeProps={{ class: `font-bold` }}
              >
                <pre class="text-sm">
                  {user.name}{' '}
                  <MatchRoute
                    to={userRoute.to}
                    search={{
                      userId: user.id,
                    }}
                    pending
                  >
                    {(match) => <Spinner show={!!match} wait="delay-50" />}
                  </MatchRoute>
                </pre>
              </Link>
            </div>
          )
        })}
      </div>
      <div class="flex-initial border-l">
        <Outlet />
      </div>
    </div>
  )
}

const usersIndexRoute = createRoute({
  getParentRoute: () => usersLayoutRoute,
  path: '/',
  component: UsersIndexComponent,
})

function UsersIndexComponent() {
  return (
    <div class="p-2 space-y-2">
      <p>
        Normally, setting default search parameters would either need to be done
        manually in every link to a page, or as a side-effect (not a great
        experience).
      </p>
      <p>
        Instead, we can use <strong>search filters</strong> to provide defaults
        or even persist search params for links to routes (and child routes).
      </p>
      <p>
        A good example of this is the sorting and filtering of the users list.
        In a traditional router, both would be lost while navigating around
        individual users or even changing each sort/filter option unless each
        state was manually passed from the current route into each new link we
        created (that's a lot of tedious and error-prone work). With TanStack
        router and search filters, they are persisted with little effort.
      </p>
    </div>
  )
}

const userRoute = createRoute({
  getParentRoute: () => usersLayoutRoute,
  path: 'user',
  validateSearch: z.object({
    userId: z.number(),
  }),
  loaderDeps: ({ search }) => ({
    userId: search.userId,
  }),
  loader: (opts) =>
    opts.context.queryClient.ensureQueryData(
      userQueryOptions(opts.deps.userId),
    ),
  component: UserComponent,
})

function UserComponent() {
  const search = userRoute.useSearch()
  const userQuery = useQuery(() => userQueryOptions(search().userId))
  const user = userQuery.data

  return (
    <>
      <h4 class="p-2 font-bold">{user?.name}</h4>
      <pre class="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
  )
}

const expensiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Your elements can be asynchronous, which means you can code-split!
  path: 'expensive',
  component: lazyRouteComponent(() => import('./Expensive')),
})

const authPathlessLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  // Before loading, authenticate the user via our auth context
  // This will also happen during prefetching (e.g. hovering over links, etc)
  beforeLoad: ({ context, location }) => {
    // If the user is logged out, redirect them to the login page
    if (context.auth.status === 'loggedOut') {
      throw redirect({
        to: loginRoute.to,
        search: {
          // Use the current location to power a redirect after login
          // (Do not use `router.state.resolvedLocation` as it can
          // potentially lag behind the actual current location)
          redirect: location.href,
        },
      })
    }

    // Otherwise, return the user in context
    return {
      username: auth.username,
    }
  },
})

const profileRoute = createRoute({
  getParentRoute: () => authPathlessLayoutRoute,
  path: 'profile',
  component: ProfileComponent,
})

function ProfileComponent() {
  const routeContext = profileRoute.useRouteContext()

  return (
    <div class="p-2 space-y-2">
      <div>
        Username:<strong>{routeContext().username}</strong>
      </div>
    </div>
  )
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
}).update({
  component: LoginComponent,
})

function LoginComponent() {
  const router = useRouter()
  const routeContext = loginRoute.useRouteContext({
    select: ({ auth }) => ({ auth, status: auth.status }),
  })
  const search = useSearch({ from: loginRoute.fullPath })
  const [username, setUsername] = Solid.createSignal('')

  const onSubmit = (e: any) => {
    e.preventDefault()
    routeContext()?.auth.login(username())
    router.invalidate()
  }

  // Ah, the subtle nuances of client side auth. 🙄
  Solid.createRenderEffect(() => {
    if (routeContext().status === 'loggedIn' && search().redirect) {
      router.history.push(search().redirect!)
    }
  }, [routeContext().status, search().redirect])

  return status === 'loggedIn' ? (
    <div>
      Logged in as <strong>{routeContext().auth.username}</strong>
      <div class="h-2" />
      <button
        onClick={() => routeContext().auth.logout()}
        class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
      >
        Log out
      </button>
      <div class="h-2" />
    </div>
  ) : (
    <div class="p-2">
      <div>You must log in!</div>
      <div class="h-2" />
      <form onSubmit={onSubmit} class="flex gap-2">
        <input
          value={username()}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          class="border p-1 px-2 rounded"
        />
        <button
          onClick={() => routeContext().auth.logout()}
          class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
        >
          Login
        </button>
      </form>
    </div>
  )
}

const pathlessLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'pathlessLayout',
  component: PathlessLayoutComponent,
})

function PathlessLayoutComponent() {
  return (
    <div>
      <div>Pathless Layout</div>
      <hr />
      <Outlet />
    </div>
  )
}

const pathlessLayoutARoute = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  path: 'route-a',
  component: PathlessLayoutAComponent,
})

function PathlessLayoutAComponent() {
  return (
    <div>
      <div>I'm A</div>
    </div>
  )
}

const pathlessLayoutBRoute = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  path: 'route-b',
  component: PathlessLayoutBComponent,
})

function PathlessLayoutBComponent() {
  return (
    <div>
      <div>i"m B</div>
    </div>
  )
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardLayoutRoute.addChildren([
    dashboardIndexRoute,
    invoicesLayoutRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
    usersLayoutRoute.addChildren([usersIndexRoute, userRoute]),
  ]),
  expensiveRoute,
  authPathlessLayoutRoute.addChildren([profileRoute]),
  loginRoute,
  pathlessLayoutRoute.addChildren([pathlessLayoutARoute, pathlessLayoutBRoute]),
])

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  defaultPendingComponent: () => (
    <div class={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
  defaultErrorComponent: ({ error }) => <ErrorComponent error={error} />,
  context: {
    auth: undefined!, // We'll inject this when we render
    queryClient,
  },
  defaultPreload: 'intent',
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

const auth: Auth = {
  status: 'loggedOut',
  username: undefined,
  login: (username: string) => {
    auth.status = 'loggedIn'
    auth.username = username
  },
  logout: () => {
    auth.status = 'loggedOut'
    auth.username = undefined
  },
}

function App() {
  // This stuff is just to tweak our sandbox setup in real-time
  const [loaderDelay, setLoaderDelay] = useSessionStorage('loaderDelay', 500)
  const [pendingMs, setPendingMs] = useSessionStorage('pendingMs', 1000)
  const [pendingMinMs, setPendingMinMs] = useSessionStorage('pendingMinMs', 500)

  return (
    <>
      <div class="text-xs fixed w-52 shadow-md shadow-black/20 rounded bottom-2 left-2 bg-white dark:bg-gray-800 bg-opacity-75 border-b flex flex-col gap-1 flex-wrap items-left divide-y">
        <div class="p-2 space-y-2">
          <div class="flex gap-2">
            <button
              class="bg-blue-500 text-white rounded p-1 px-2"
              onClick={() => {
                setLoaderDelay(150)
              }}
            >
              Fast
            </button>
            <button
              class="bg-blue-500 text-white rounded p-1 px-2"
              onClick={() => {
                setLoaderDelay(500)
              }}
            >
              Fast 3G
            </button>
            <button
              class="bg-blue-500 text-white rounded p-1 px-2"
              onClick={() => {
                setLoaderDelay(2000)
              }}
            >
              Slow 3G
            </button>
          </div>
          <div>
            <div>Loader Delay: {loaderDelay()}ms</div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={loaderDelay()}
              onChange={(e) => setLoaderDelay(e.target.valueAsNumber)}
              class="w-full"
            />
          </div>
        </div>
        <div class="p-2 space-y-2">
          <div class="flex gap-2">
            <button
              class="bg-blue-500 text-white rounded p-1 px-2"
              onClick={() => {
                setPendingMs(1000)
                setPendingMinMs(500)
              }}
            >
              Reset to Default
            </button>
          </div>
          <div>
            <div>defaultPendingMs: {pendingMs()}ms</div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={pendingMs()}
              onChange={(e) => setPendingMs(e.target.valueAsNumber)}
              class="w-full"
            />
          </div>
          <div>
            <div>defaultPendingMinMs: {pendingMinMs()}ms</div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={pendingMinMs()}
              onChange={(e) => setPendingMinMs(e.target.valueAsNumber)}
              class="w-full"
            />
          </div>
        </div>
      </div>
      <QueryClientProvider client={queryClient}>
        <RouterProvider
          router={router}
          defaultPreload="intent"
          defaultPendingMs={pendingMs()}
          defaultPendingMinMs={pendingMinMs()}
          context={{
            auth,
          }}
        />
      </QueryClientProvider>
    </>
  )
}

function InvoiceFields({
  invoice,
  disabled,
}: {
  invoice: Invoice
  disabled?: boolean
}) {
  return (
    <div class="space-y-2">
      <h2 class="font-bold text-lg">
        <input
          name="title"
          value={invoice.title}
          placeholder="Invoice Title"
          class="border border-opacity-50 rounded p-2 w-full"
          disabled={disabled}
        />
      </h2>
      <div>
        <textarea
          name="body"
          value={invoice.body}
          rows={6}
          placeholder="Invoice Body..."
          class="border border-opacity-50 p-2 rounded w-full"
          disabled={disabled}
        />
      </div>
    </div>
  )
}

type Auth = {
  login: (username: string) => void
  logout: () => void
  status: 'loggedOut' | 'loggedIn'
  username?: string
}

function Spinner({ show, wait }: { show?: boolean; wait?: `delay-${number}` }) {
  return (
    <div
      class={`inline-block animate-spin px-3 transition ${
        (show ?? true)
          ? `opacity-1 duration-500 ${wait ?? 'delay-300'}`
          : 'duration-500 opacity-0 delay-0'
      }`}
    >
      ⍥
    </div>
  )
}

function useSessionStorage<T>(key: string, initialValue: T) {
  const stored = sessionStorage.getItem(key)
  const [state, setState] = Solid.createSignal<T>(
    stored ? JSON.parse(stored) : initialValue,
  )

  Solid.createEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(state()))
  })

  return [state, setState]
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  render(() => <App />, rootElement)
}
