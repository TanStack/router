import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  lazy,
  Link,
  MatchRoute,
  useNavigate,
  useSearch,
  Router,
  useParams,
  RootRoute,
  Route,
} from '@tanstack/router'
import {
  Action,
  ActionClient,
  ActionClientProvider,
  useAction,
} from '@tanstack/react-actions'
import {
  Loader,
  useLoader,
  LoaderClient,
  useLoaderClient,
  LoaderClientProvider,
} from '@tanstack/react-loaders'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

import {
  fetchInvoices,
  fetchInvoiceById,
  fetchUsers,
  fetchUserById,
  Invoice,
  postInvoice,
  patchInvoice,
  fetchRandomNumber,
} from './mockTodos'

import { z } from 'zod'

//

type UsersViewSortBy = 'name' | 'id' | 'email'

// Loaders

const invoicesLoader = new Loader({
  fn: async () => {
    console.log('Fetching invoices...')
    return fetchInvoices()
  },
})

const invoiceLoader = new Loader({
  fn: async (invoiceId: number) => {
    console.log(`Fetching invoice with id ${invoiceId}...`)
    return fetchInvoiceById(invoiceId)
  },
  onInvalidate: async () => {
    await invoicesLoader.invalidate()
  },
})

const usersLoader = new Loader({
  fn: async () => {
    console.log('Fetching users...')
    return fetchUsers()
  },
})

const userLoader = new Loader({
  fn: async (userId: number) => {
    console.log(`Fetching user with id ${userId}...`)
    return fetchUserById(userId)
  },
  onInvalidate: async () => {
    await usersLoader.invalidate()
  },
})

const randomIdLoader = new Loader({
  fn: () => {
    return fetchRandomNumber()
  },
})

const loaderClient = new LoaderClient({
  getLoaders: () => ({
    invoicesLoader,
    invoiceLoader,
    usersLoader,
    userLoader,
    randomIdLoader,
  }),
})

// Register things for typesafety
declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: typeof loaderClient
  }
}

// Actions

const createInvoiceAction = new Action({
  key: 'createInvoice',
  action: postInvoice,
  onEachSuccess: async () => {
    await invoicesLoader.invalidate()
  },
})

const updateInvoiceAction = new Action({
  key: 'updateInvoice',
  action: patchInvoice,
  onEachSuccess: async ({ payload }) => {
    await invoiceLoader.invalidateInstance({
      variables: payload.id,
    })
  },
})

const actionClient = new ActionClient({
  getActions: () => [createInvoiceAction, updateInvoiceAction],
})

// Register things for typesafety
declare module '@tanstack/react-actions' {
  interface Register {
    actionClient: typeof actionClient
  }
}

// Routes

// Build our routes. We could do this in our component, too.
const rootRoute = RootRoute.withRouterContext<{ auth: AuthContext }>()({
  component: () => {
    const loaderClient = useLoaderClient()

    return (
      <>
        <div className={`min-h-screen flex flex-col`}>
          <div className={`flex items-center border-b gap-2`}>
            <h1 className={`text-3xl p-2`}>Kitchen Sink</h1>
            {/* Show a global spinner when the router is transitioning */}
            <div
              className={`text-3xl duration-300 delay-0 opacity-0 ${
                loaderClient.state.isLoading ? ` duration-1000 opacity-40` : ''
              }`}
            >
              <Spinner />
            </div>
          </div>
          <div className={`flex-1 flex`}>
            <div className={`divide-y w-56`}>
              {(
                [
                  ['/', 'Home'],
                  ['/dashboard', 'Dashboard'],
                  ['/expensive', 'Expensive'],
                  ['/layout-a', 'Layout A'],
                  ['/layout-b', 'Layout B'],
                  ['/authenticated', 'Authenticated'],
                  ['/login', 'Login'],
                ] as const
              ).map(([to, label]) => {
                return (
                  <div key={to}>
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
                      className={`block py-2 px-3 text-blue-700`}
                      // Make "active" links bold
                      activeProps={{ className: `font-bold` }}
                    >
                      {label}
                    </Link>
                  </div>
                )
              })}
            </div>
            <div className={`flex-1 border-l border-gray-200`}>
              {/* Render our first route match */}
              <Outlet />
            </div>
          </div>
        </div>
        <TanStackRouterDevtools position="bottom-right" />
      </>
    )
  },
})

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return (
      <div className={`p-2`}>
        <div className={`text-lg`}>Welcome Home!</div>
        <hr className={`my-2`} />
        <Link
          to={invoiceRoute.fullPath}
          params={{
            invoiceId: 3,
          }}
          className={`py-1 px-2 text-xs bg-blue-500 text-white rounded-full`}
        >
          1 New Invoice
        </Link>
        <hr className={`my-2`} />
        <div className={`max-w-xl`}>
          As you navigate around take note of the UX. It should feel
          suspense-like, where routes are only rendered once all of their data
          and elements are ready.
          <hr className={`my-2`} />
          To exaggerate async effects, play with the artificial request delay
          slider in the bottom-left corner.
          <hr className={`my-2`} />
          The last 2 sliders determine if link-hover preloading is enabled (and
          how long those preloads stick around) and also whether to cache
          rendered route data (and for how long). Both of these default to 0 (or
          off).
        </div>
      </div>
    )
  },
})

const dashboardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'dashboard',
  loader: ({ preload }) => invoicesLoader.load({ preload }),
  component: () => {
    return (
      <>
        <div className="flex items-center border-b">
          <h2 className="text-xl p-2">Dashboard</h2>
          <Link
            to="/dashboard/invoices/$invoiceId"
            params={{
              invoiceId: 3,
            }}
            className="py-1 px-2 text-xs bg-blue-500 text-white rounded-full"
          >
            1 New Invoice
          </Link>
        </div>
        <div className="flex flex-wrap divide-x">
          {(
            [
              ['/dashboard', 'Summary', undefined, true],
              ['/dashboard/invoices', 'Invoices'],
              ['/dashboard/users', 'Users', true],
            ] as const
          ).map(([to, label, search, exact]) => {
            return (
              <Link
                key={to}
                to={to}
                search={search}
                activeOptions={{ exact }}
                activeProps={{ className: `font-bold` }}
                className="p-2"
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
  },
})

const dashboardIndexRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: () => {
    const {
      state: { data: invoices },
    } = invoicesLoader.useLoader()

    return (
      <div className="p-2">
        <div className="p-2">
          Welcome to the dashboard! You have{' '}
          <strong>{invoices.length} total invoices</strong>.
        </div>
      </div>
    )
  },
})

const invoicesRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: 'invoices',
  component: () => {
    const {
      state: { data: invoices },
    } = invoicesLoader.useLoader()

    const {
      state: { pendingSubmissions: updateSubmissions },
    } = useAction({
      key: updateInvoiceAction.key,
    })

    const {
      state: { pendingSubmissions: createSubmissions },
    } = useAction({
      key: createInvoiceAction.key,
    })

    return (
      <div className="flex-1 flex">
        <div className="divide-y w-48">
          {invoices?.map((invoice) => {
            const updateSubmission = updateSubmissions.find(
              (d) => d.payload.id === invoice.id,
            )

            if (updateSubmission) {
              invoice = {
                ...invoice,
                ...updateSubmission.payload,
              }
            }

            return (
              <div key={invoice.id}>
                <Link
                  to="/dashboard/invoices/$invoiceId"
                  params={{
                    invoiceId: invoice.id,
                  }}
                  preload="intent"
                  className="block py-2 px-3 text-blue-700"
                  activeProps={{ className: `font-bold` }}
                >
                  <pre className="text-sm">
                    #{invoice.id} - {invoice.title.slice(0, 10)}{' '}
                    {updateSubmission ? (
                      <Spinner />
                    ) : (
                      <MatchRoute
                        to={invoiceRoute.fullPath}
                        params={{
                          invoiceId: invoice.id,
                        }}
                        pending
                      >
                        <Spinner />
                      </MatchRoute>
                    )}
                  </pre>
                </Link>
              </div>
            )
          })}
          {createSubmissions.map((action) => (
            <div key={action.submittedAt}>
              <a href="#" className="block py-2 px-3 text-blue-700">
                <pre className="text-sm">
                  #<Spinner /> - {action.payload.title?.slice(0, 10)}
                </pre>
              </a>
            </div>
          ))}
        </div>
        <div className="flex-1 border-l border-gray-200">
          <Outlet />
        </div>
      </div>
    )
  },
})

const invoicesIndexRoute = new Route({
  getParentRoute: () => invoicesRoute,
  path: '/',
  component: () => {
    const {
      state: { latestSubmission },
    } = useAction({ key: createInvoiceAction.key })

    return (
      <>
        <div className="p-2">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const formData = new FormData(event.target as HTMLFormElement)
              createInvoiceAction.submit({
                title: formData.get('title') as string,
                body: formData.get('body') as string,
              })
            }}
            className="space-y-2"
          >
            <div>Create a new Invoice:</div>
            <InvoiceFields invoice={{} as Invoice} />
            <div>
              <button
                className="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
                // disabled={action.current?.status === 'pending'}
              >
                Create
              </button>
            </div>
            {latestSubmission?.status === 'success' ? (
              <div className="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Created!
              </div>
            ) : latestSubmission?.status === 'error' ? (
              <div className="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Failed to create.
              </div>
            ) : null}
          </form>
        </div>
      </>
    )
  },
})

const invoiceRoute = new Route({
  getParentRoute: () => invoicesRoute,
  path: '$invoiceId',
  parseParams: (params) => ({
    invoiceId: z.number().int().parse(Number(params.invoiceId)),
  }),
  stringifyParams: ({ invoiceId }) => ({ invoiceId: `${invoiceId}` }),
  validateSearch: (search) =>
    z
      .object({
        showNotes: z.boolean().optional(),
        notes: z.string().optional(),
      })
      .parse(search),
  loader: async ({ params: { invoiceId }, preload }) => {
    const invoicesLoaderInstance = invoiceLoader.getInstance({
      variables: invoiceId,
    })

    await invoicesLoaderInstance.load({
      preload,
    })

    return () => invoicesLoaderInstance.useInstance()
  },
  component: ({ useLoader, useSearch }) => {
    const search = useSearch()
    const navigate = useNavigate()

    const {
      state: { data: invoice },
    } = useLoader()()

    const {
      state: { latestSubmission },
    } = useAction({ key: updateInvoiceAction.key })

    const [notes, setNotes] = React.useState(search.notes ?? '')

    React.useEffect(() => {
      navigate({
        search: (old) => ({
          ...old,
          notes: notes ? notes : undefined,
        }),
        replace: true,
      })
    }, [notes])

    return (
      <form
        key={invoice.id}
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const formData = new FormData(event.target as HTMLFormElement)
          updateInvoiceAction.submit({
            id: invoice.id,
            title: formData.get('title') as string,
            body: formData.get('body') as string,
          })
        }}
        className="p-2 space-y-2"
      >
        <InvoiceFields
          invoice={invoice}
          disabled={latestSubmission?.status === 'pending'}
        />
        <div>
          <Link
            search={(old) => ({
              ...old,
              showNotes: old?.showNotes ? undefined : true,
            })}
            className="text-blue-700"
          >
            {search.showNotes ? 'Close Notes' : 'Show Notes'}{' '}
          </Link>
          {search.showNotes ? (
            <>
              <div>
                <div className="h-2" />
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value)
                  }}
                  rows={5}
                  className="shadow w-full p-2 rounded"
                  placeholder="Write some notes here..."
                />
                <div className="italic text-xs">
                  Notes are stored in the URL. Try copying the URL into a new
                  tab!
                </div>
              </div>
            </>
          ) : null}
        </div>
        <div>
          <button
            className="bg-blue-500 rounded p-2 uppercase text-white font-black disabled:opacity-50"
            disabled={latestSubmission?.status === 'pending'}
          >
            Save
          </button>
        </div>
        {latestSubmission?.payload.id === invoice.id ? (
          <div key={latestSubmission?.submittedAt}>
            {latestSubmission?.status === 'success' ? (
              <div className="inline-block px-2 py-1 rounded bg-green-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Saved!
              </div>
            ) : latestSubmission?.status === 'error' ? (
              <div className="inline-block px-2 py-1 rounded bg-red-500 text-white animate-bounce [animation-iteration-count:2.5] [animation-duration:.3s]">
                Failed to save.
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    )
  },
})

const usersRoute = new Route({
  getParentRoute: () => dashboardRoute,
  path: 'users',
  validateSearch: z.object({
    usersView: z
      .object({
        sortBy: z.enum(['name', 'id', 'email']).optional(),
        filterBy: z.string().optional(),
      })
      .optional(),
  }).parse,
  preSearchFilters: [
    // Persist (or set as default) the usersView search param
    // while navigating within or to this route (or it's children!)
    (search) => ({
      ...search,
      usersView: {
        ...search.usersView,
      },
    }),
  ],
  loader: ({ preload }) => usersLoader.load({ preload }),
  component: ({ useSearch }) => {
    const navigate = useNavigate()
    const { usersView } = useSearch()

    const {
      state: { data: users },
    } = usersLoader.useLoader()

    const sortBy = usersView?.sortBy ?? 'name'
    const filterBy = usersView?.filterBy

    const [filterDraft, setFilterDraft] = React.useState(filterBy ?? '')

    const sortedUsers = React.useMemo(() => {
      if (!users) return []

      return !sortBy
        ? users
        : [...users].sort((a, b) => {
            return a[sortBy] > b[sortBy] ? 1 : -1
          })
    }, [users, sortBy])

    const filteredUsers = React.useMemo(() => {
      if (!filterBy) return sortedUsers

      return sortedUsers.filter((user) =>
        user.name.toLowerCase().includes(filterBy.toLowerCase()),
      )
    }, [sortedUsers, filterBy])

    const setSortBy = (sortBy: UsersViewSortBy) =>
      navigate({
        search: (old) => {
          return {
            ...old,
            usersView: {
              ...(old?.usersView ?? {}),
              sortBy,
            },
          }
        },
        replace: true,
      })

    React.useEffect(() => {
      navigate({
        search: (old) => {
          return {
            ...old,
            usersView: {
              ...old?.usersView,
              filterBy: filterDraft || undefined,
            },
          }
        },
        replace: true,
      })
    }, [filterDraft])

    return (
      <div className="flex-1 flex">
        <div className="divide-y">
          <div className="py-2 px-3 flex gap-2 items-center bg-gray-100">
            <div>Sort By:</div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as UsersViewSortBy)}
              className="flex-1 border p-1 px-2 rounded"
            >
              {['name', 'id', 'email'].map((d) => {
                return <option key={d} value={d} children={d} />
              })}
            </select>
          </div>
          <div className="py-2 px-3 flex gap-2 items-center bg-gray-100">
            <div>Filter By:</div>
            <input
              value={filterDraft}
              onChange={(e) => setFilterDraft(e.target.value)}
              placeholder="Search Names..."
              className="min-w-0 flex-1 border p-1 px-2 rounded"
            />
          </div>
          {filteredUsers?.map((user) => {
            return (
              <div key={user.id}>
                <Link
                  to="/dashboard/users/user"
                  search={(d) => ({
                    ...d,
                    userId: user.id,
                  })}
                  className="block py-2 px-3 text-blue-700"
                  activeProps={{ className: `font-bold` }}
                >
                  <pre className="text-sm">
                    {user.name}{' '}
                    <MatchRoute
                      to={userRoute.fullPath}
                      search={(d) => ({
                        ...d,
                        userId: user.id,
                      })}
                      pending
                    >
                      <Spinner />
                    </MatchRoute>
                  </pre>
                </Link>
              </div>
            )
          })}
        </div>
        <div className="flex-initial border-l border-gray-200">
          <Outlet />
        </div>
      </div>
    )
  },
})

const usersIndexRoute = new Route({
  getParentRoute: () => usersRoute,
  path: '/',
  component: () => {
    return (
      <div className="p-2 space-y-2">
        <p>
          Normally, setting default search parameters would either need to be
          done manually in every link to a page, or as a side-effect (not a
          great experience).
        </p>
        <p>
          Instead, we can use <strong>search filters</strong> to provide
          defaults or even persist search params for links to routes (and child
          routes).
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
  },
})

const userRoute = new Route({
  getParentRoute: () => usersRoute,
  path: 'user',
  // parseParams: ({ userId }) => ({ userId: Number(userId) }),
  // stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  validateSearch: z.object({
    userId: z.number(),
  }),
  loader: async ({ search: { userId }, preload }) => {
    const userLoaderInstance = userLoader.getInstance({ variables: userId })

    await userLoaderInstance.load({ preload })

    return () => userLoaderInstance.useInstance()
  },
  component: ({ useLoader }) => {
    const {
      state: { data: user },
    } = useLoader()()

    return (
      <>
        <h4 className="p-2 font-bold">{user?.name}</h4>
        <pre className="text-sm whitespace-pre-wrap">
          {JSON.stringify(user, null, 2)}
        </pre>
      </>
    )
  },
})

const expensiveRoute = new Route({
  getParentRoute: () => rootRoute,
  // Your elements can be asynchronous, which means you can code-split!
  path: 'expensive',
  component: lazy(() => import('./Expensive')),
})

const AuthError = new Error('Not logged in')

const authenticatedRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'authenticated',
  onLoadError: (error) => {
    if (error === AuthError) {
      router.navigate({
        to: loginRoute.fullPath,
        search: {
          // Use latestLocation (not currentLocation) to get the live url
          // (as opposed to the committed url, which is technically async
          // and resolved after the pending state)
          redirect: router.state.latestLocation.href,
        },
      })
    }

    throw error
  },
  beforeLoad: () => {
    if (router.options.context.auth.status === 'loggedOut') {
      throw AuthError
    }
  },
  component: () => {
    const auth = useAuth()

    return (
      <div className="p-2 space-y-2">
        <div>Super secret authenticated route!</div>
        <div>
          Your username is <strong>{auth.username}</strong>
        </div>
      </div>
    )
  },
})

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  component: () => {
    const search = useSearch({ from: loginRoute.id })
    const auth = useAuth()
    const [username, setUsername] = React.useState('')

    const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      auth.login(username)
    }

    React.useEffect(() => {
      if (auth.status === 'loggedIn' && search.redirect) {
        window.history.pushState({}, '', search.redirect)
      }
    }, [auth.status, search.redirect])

    return auth.status === 'loggedIn' ? (
      <div>
        Logged in as <strong>{auth.username}</strong>
        <div className="h-2" />
        <button
          onClick={() => auth.logout()}
          className="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
        >
          Log out
        </button>
        <div className="h-2" />
      </div>
    ) : (
      <div className="p-2">
        <div>You must log in!</div>
        <div className="h-2" />
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="border p-1 px-2 rounded"
          />
          <button
            onClick={() => auth.logout()}
            className="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
          >
            Login
          </button>
        </form>
      </div>
    )
  },
})

const layoutRoute = new Route({
  getParentRoute: () => rootRoute,
  id: 'layout',
  loader: async ({ preload }) => randomIdLoader.load({ preload }),
  component: () => {
    const randomIdLoaderInstance = randomIdLoader.useLoader()

    return (
      <div>
        <div>Layout</div>
        <div>Random #: {randomIdLoaderInstance.state.data}</div>
        <hr />
        <Outlet />
      </div>
    )
  },
})

const layoutARoute = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-a',
  component: () => {
    return (
      <div>
        <div>Layout A</div>
      </div>
    )
  },
})

const layoutBRoute = new Route({
  getParentRoute: () => layoutRoute,
  path: 'layout-b',
  component: () => {
    return (
      <div>
        <div>Layout B</div>
      </div>
    )
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute.addChildren([
    dashboardIndexRoute,
    invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
    usersRoute.addChildren([usersIndexRoute, userRoute]),
  ]),
  expensiveRoute,
  authenticatedRoute,
  loginRoute,
  layoutRoute.addChildren([layoutARoute, layoutBRoute]),
])

const router = new Router({
  routeTree,
  defaultPendingComponent: () => (
    <div className={`p-2 text-2xl`}>
      <Spinner />
    </div>
  ),
  onRouteChange: () => {
    actionClient.clearAll()
  },
  context: {
    auth: undefined!,
  },
})

declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}

// Provide our location and routes to our application
function App() {
  return (
    <>
      <AuthProvider>
        <SubApp />
      </AuthProvider>
    </>
  )
}

function SubApp() {
  // This stuff is just to tweak our sandbox setup in real-time
  const [loaderDelay, setLoaderDelay] = useSessionStorage('loaderDelay', 500)
  const [actionDelay, setActionDelay] = useSessionStorage('actionDelay', 500)

  const [defaultLoaderMaxAge, setDefaultLoaderMaxAge] = useSessionStorage(
    'defaultLoaderMaxAge',
    0,
  )

  return (
    <>
      {' '}
      <div className="text-xs fixed w-52 shadow rounded bottom-2 left-2 bg-white bg-opacity-75 p-2 border-b flex flex-col gap-1 flex-wrap items-left">
        <div>Loader Delay: {loaderDelay}ms</div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={loaderDelay}
            onChange={(e) => setLoaderDelay(e.target.valueAsNumber)}
            className="w-full"
          />
        </div>

        <div>Action Delay: {actionDelay}ms</div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={actionDelay}
            onChange={(e) => setActionDelay(e.target.valueAsNumber)}
            className="w-full"
          />
        </div>
        <div>
          Loader Max Age:{' '}
          {defaultLoaderMaxAge ? `${defaultLoaderMaxAge}ms` : 'Off'}
        </div>
        <div>
          <input
            type="range"
            min="0"
            max="10000"
            step="250"
            value={defaultLoaderMaxAge}
            onChange={(e) => setDefaultLoaderMaxAge(e.target.valueAsNumber)}
            className={`w-full`}
          />
        </div>
      </div>
      <LoaderClientProvider
        loaderClient={loaderClient}
        defaultMaxAge={defaultLoaderMaxAge}
      >
        <ActionClientProvider actionClient={actionClient}>
          <RouterProvider
            router={router}
            defaultPreload="intent"
            context={{
              auth: useAuth(),
            }}
          />
        </ActionClientProvider>
      </LoaderClientProvider>
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
    <div className="space-y-2">
      <h2 className="font-bold text-lg">
        <input
          name="title"
          defaultValue={invoice?.title}
          placeholder="Invoice Title"
          className="border border-opacity-50 rounded p-2 w-full"
          disabled={disabled}
        />
      </h2>
      <div>
        <textarea
          name="body"
          defaultValue={invoice?.body}
          rows={6}
          placeholder="Invoice Body..."
          className="border border-opacity-50 p-2 rounded w-full"
          disabled={disabled}
        />
      </div>
    </div>
  )
}

type AuthContext = {
  login: (username: string) => void
  logout: () => void
} & AuthContextState

type AuthContextState = {
  status: 'loggedOut' | 'loggedIn'
  username?: string
}

const AuthContext = React.createContext<AuthContext>(null!)

function AuthProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthContextState>({
    status: 'loggedOut',
  })

  const login = (username: string) => {
    setState({ status: 'loggedIn', username })
  }

  const logout = () => {
    setState({ status: 'loggedOut' })
  }

  const contextValue = React.useMemo(
    () => ({
      ...state,
      login,
      logout,
    }),
    [state],
  )

  return <AuthContext.Provider value={contextValue} children={props.children} />
}

function useAuth() {
  return React.useContext(AuthContext)
}

function Spinner() {
  return <div className="inline-block animate-spin px-3">⍥</div>
}

function useSessionStorage<T>(key: string, initialValue: T) {
  const state = React.useState<T>(() => {
    const stored = sessionStorage.getItem(key)
    return stored ? JSON.parse(stored) : initialValue
  })

  React.useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(state[0]))
  }, [state[0]])

  return state
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<App />)
}
