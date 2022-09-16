// @sts-nocheck
import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  useSearch,
  useNavigate,
  MatchRoute,
  useLoaderData,
  useAction,
  createRoutes,
} from '@tanstack/react-router'
import { ReactLocationDevtools } from '@tanstack/router-devtools'

import {
  fetchInvoices,
  fetchInvoiceById,
  fetchUsers,
  fetchUserById,
  Invoice,
  User,
  postInvoice,
  patchInvoice,
} from './mockTodos'

import reallyExpensiveRoute from './reallyExpensive'
import { loaderDelayFn } from './utils'
import { z } from 'zod'

//

type UsersViewSortBy = 'name' | 'id' | 'email'

declare module '@tanstack/react-router' {
  // interface SearchSchema {
  //   showNotes?: boolean
  //   notes?: string
  // }
  // interface RouteParams {
  //   invoiceId: string
  //   userId: string
  // }
  // interface LoaderData {
  //   invoices: Invoice[]
  //   invoice: Invoice
  //   users: User[]
  //   user: User
  //   expensiveTimestamp: number
  //   reallyExpensiveTimestamp: number
  // }
}

// Build our routes. We could do this in our component, too.
const routes = createRoutes().addChildren((createRoute) => [
  createRoute({ path: '/', element: <Home /> }),
  createRoute({
    path: 'dashboard',
    element: <Dashboard />,
    loader: async () => {
      console.log('Fetching all invoices...')
      return {
        invoices: await fetchInvoices(),
      }
    },
  }).addChildren((createRoute) => [
    createRoute({ path: '/', element: <DashboardHome /> }),
    createRoute({
      path: 'invoices',
      element: <Invoices />,
    }).addChildren((createRoute) => [
      createRoute({
        path: '/',
        element: <InvoicesHome />,
        action: async (partialInvoice: Partial<Invoice>) => {
          const invoice = await postInvoice(partialInvoice)
          // // Redirect to the new invoice
          // router.navigate({
          //   to: invoice.id,
          //   // Use the current match for relative paths
          //   from: ctx.match.pathname,
          // })
          return invoice
        },
      }),
      createRoute({
        path: ':invoiceId',
        element: <InvoiceView />,
        loader: async ({ params: { invoiceId } }) => {
          console.log('Fetching invoice...')
          return {
            invoice: await fetchInvoiceById(invoiceId!),
          }
        },
        action: patchInvoice,
      }),
    ]),
    createRoute({
      path: 'users',
      element: <Users />,
      loader: async ({ search }) => {
        search
        return {
          users: await fetchUsers(),
        }
      },
      searchZod: {
        usersView: z
          .object({
            sortBy: z.enum(['name', 'id', 'email']).optional(),
            filterBy: z.string().optional(),
          })
          .optional(),
      },
      preSearchFilters: [
        // Keep the usersView search param around
        // while in this route (or it's children!)
        (search) => ({
          ...search,
          usersView: {
            ...search.usersView,
          },
        }),
      ],
    }).addChildren((createRoute) => [
      createRoute({
        path: ':userId',
        element: <UserView />,
        loader: async ({ params: { userId } }) => {
          return {
            user: await fetchUserById(userId!),
          }
        },
      }),
    ]),
  ]),
  createRoute({
    // Your elements can be asynchronous, which means you can code-split!
    path: 'expensive',
    element: () =>
      loaderDelayFn(() => import('./Expensive')).then((res) => (
        <res.Expensive />
      )),
  }),
  // Obviously, you can put routes in other files, too
  // reallyExpensiveRoute,
  createRoute({
    path: 'authenticated/', // Trailing slash doesn't mean anything
    element: <Auth />,
  }).addChildren((createRoute) => [
    createRoute({
      path: '/',
      element: <Authenticated />,
    }),
  ]),
])

const router = new ReactRouter({
  routes,
})

// Provide our location and routes to our application
function App() {
  // This stuff is just to tweak our sandbox setup in real-time
  const [loaderDelay, setLoaderDelay] = useSessionStorage('loaderDelay', 500)
  const [actionDelay, setActionDelay] = useSessionStorage('actionDelay', 500)
  const [defaultPendingMs, setDefaultPendingMs] = useSessionStorage(
    'defaultPendingMs',
    2000,
  )
  const [defaultPendingMinMs, setDefaulPendingMinMs] = useSessionStorage(
    'defaultPendingMinMs',
    1000,
  )
  const [defaultLinkPreloadMaxAge, setDefaultLinkPreloadMaxAge] =
    useSessionStorage('defaultLinkPreloadMaxAge', 0)

  return (
    <>
      {/* More stuff to tweak our sandbox setup in real-time */}
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
        <div>
          Default Pending Ms: {defaultPendingMs}ms{' '}
          {defaultPendingMs > loaderDelay ? <>🔴</> : <>🟢</>}
        </div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={defaultPendingMs}
            onChange={(e) => setDefaultPendingMs(e.target.valueAsNumber)}
            className="w-full"
          />
        </div>
        <div className={`${!defaultPendingMs ? 'opacity-30' : ''}`}>
          <div>Default Min Pending Ms: {defaultPendingMinMs}ms</div>
          <div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={defaultPendingMinMs}
              onChange={(e) => setDefaulPendingMinMs(e.target.valueAsNumber)}
              className={`w-full`}
            />
          </div>
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
          Link Preload Max Age:{' '}
          {defaultLinkPreloadMaxAge ? `${defaultLinkPreloadMaxAge}ms` : 'Off'}
        </div>
        <div>
          <input
            type="range"
            min="0"
            max="10000"
            step="250"
            value={defaultLinkPreloadMaxAge}
            onChange={(e) =>
              setDefaultLinkPreloadMaxAge(e.target.valueAsNumber)
            }
            className={`w-full`}
          />
        </div>
      </div>
      {/* Normally <Router /> matches and renders our
      routes, but when we pass our own children, we can use
      <Outlet /> to start rendering our matches when we're
      // ready. This also let's us use router API's
      in <Root /> before rendering any routes */}
      <AuthProvider>
        <RouterProvider
          router={router}
          defaultPendingElement={
            <div className={`p-2 text-2xl`}>
              <Spinner />
            </div>
          }
          defaultLinkPreloadMaxAge={defaultLinkPreloadMaxAge}
          defaultPendingMs={defaultPendingMs}
          defaultPendingMinMs={defaultPendingMinMs}
          // Normally, the options above aren't changing, but for this particular
          // example, we need to key the router when they change
          key={[
            defaultLinkPreloadMaxAge,
            defaultPendingMs,
            defaultPendingMinMs,
          ].join('.')}
        >
          <Root />
          <ReactLocationDevtools position="bottom-right" />
        </RouterProvider>
      </AuthProvider>
    </>
  )
}

function Root() {
  return (
    <div className={`min-h-screen flex flex-col`}>
      <div className={`flex items-center border-b gap-2`}>
        <h1 className={`text-3xl p-2`}>Kitchen Sink</h1>
        {/* Show a global spinner when the router is transitioning */}
        <div
          className={`text-3xl duration-100 delay-0 opacity-0 ${
            router.state.status === 'loading' ? ` duration-300 opacity-40` : ''
          }`}
        >
          <Spinner />
        </div>
      </div>
      <div className={`flex-1 flex`}>
        <div className={`divide-y w-56`}>
          {[
            ['.', 'Home'],
            ['dashboard', 'Dashboard'],
            ['expensive', 'Expensive'],
            ['really-expensive', 'Really Expensive'],
            ['authenticated/', 'Authenticated'], // This route has a trailing slash on purpose.
          ].map(([to, label]) => {
            return (
              <div key={to}>
                <Link
                  to={to}
                  className={`block py-2 px-3 text-blue-700`}
                  // Make "active" links bold
                  getActiveProps={() => ({ className: `font-bold` })}
                  activeOptions={{
                    // If the route points to the root of it's parent,
                    // make sure it's only active if it's exact
                    exact: to === '.',
                  }}
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
  )
}

function Home() {
  return (
    <div className={`p-2`}>
      <div className={`text-lg`}>Welcome Home!</div>
      <hr className={`my-2`} />
      <Link
        to="dashboard/invoices/3"
        className={`py-1 px-2 text-xs bg-blue-500 text-white rounded-full`}
      >
        1 New Invoice
      </Link>
      <hr className={`my-2`} />
      <div className={`max-w-xl`}>
        As you navigate around take note of the UX. It should feel
        suspense-like, where routes are only rendered once all of their data and
        elements are ready.
        <hr className={`my-2`} />
        To exaggerate async effects, play with the artificial request delay
        slider in the bottom-left corner. You can also play with the default
        timings for displaying the pending fallbacks and the minimum time any
        pending fallbacks will remain shown.
        <hr className={`my-2`} />
        The last 2 sliders determine if link-hover preloading is enabled (and
        how long those preloads stick around) and also whether to cache rendered
        route data (and for how long). Both of these default to 0 (or off).
      </div>
    </div>
  )
}

function Dashboard() {
  return (
    <>
      <div className="flex items-center border-b">
        <h2 className="text-xl p-2">Dashboard</h2>
        <Link
          to="./invoices/3"
          className="py-1 px-2 text-xs bg-blue-500 text-white rounded-full"
        >
          1 New Invoice
        </Link>
      </div>
      <div className="flex flex-wrap divide-x">
        {(
          [
            ['.', 'Summary'],
            ['invoices', 'Invoices'],
            ['users', 'Users', true],
          ] as const
        ).map(([to, label, search]) => {
          return (
            <router.Link
              key={to}
              to={to}
              search={search}
              className="inline-block py-2 px-3 text-blue-700"
              activeOptions={{ exact: to === '.' }}
              getActiveProps={() => ({ className: `font-bold` })}
            >
              {label}
            </router.Link>
          )
        })}
      </div>
      <hr />
      <Outlet />
    </>
  )
}

function DashboardHome() {
  const { invoices } = router.getRoute('/dashboard/').getLoaderData()

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{invoices.length} total invoices</strong>.
      </div>
    </div>
  )
}

router.getRoute('/')

function Invoices() {
  const { invoices } = router.getRoute('/dashboard/invoices').getLoaderData()

  // Get the action for a child route
  const addInvoiceAction = router.getRoute('/dashboard/invoices/').getAction()

  return (
    <div className="flex-1 flex">
      <div className="divide-y w-48">
        {invoices?.map((invoice) => {
          return (
            <div key={invoice.id}>
              <Link
                to={invoice.id}
                className="block py-2 px-3 text-blue-700"
                getActiveProps={() => ({ className: `font-bold` })}
                preload="intent"
              >
                <pre className="text-sm">
                  #{invoice.id} - {invoice.title.slice(0, 10)}{' '}
                  <MatchRoute to={invoice.id} pending>
                    <Spinner />
                  </MatchRoute>
                </pre>
              </Link>
            </div>
          )
        })}
        {addInvoiceAction.pending.map((action) => (
          <div key={action.submittedAt}>
            <Link className="block py-2 px-3 text-blue-700">
              <pre className="text-sm">
                #<Spinner /> - {action.submission.title?.slice(0, 10)}
              </pre>
            </Link>
          </div>
        ))}
      </div>
      <div className="flex-1 border-l border-gray-200">
        <Outlet />
      </div>
    </div>
  )
}

function InvoicesHome() {
  const route = router.getRoute('/dashboard/invoices/')
  const action = route.getAction()

  return (
    <>
      <div className="p-2">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const formData = new FormData(event.target as HTMLFormElement)
            action.submit({
              title: formData.get('title') as string,
              body: formData.get('body') as string,
            })
          }}
          className="space-y-2"
        >
          <div>Create a new Invoice:</div>
          <InvoiceFields invoice={{} as Invoice} />
          <div>
            <button className="bg-blue-500 rounded p-2 uppercase text-white font-black">
              Save
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function InvoiceView() {
  const { invoice } = useLoaderData()
  const search = useSearch()
  const navigate = useNavigate()
  const action = useAction()

  const [notes, setNotes] = React.useState(search.notes ?? ``)

  React.useEffect(() => {
    navigate({
      search: (old) => ({ ...old, notes: notes ? notes : undefined }),
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
        action.submit({
          title: formData.get('title') as string,
          body: formData.get('body') as string,
        })
      }}
      className="p-2 space-y-2"
    >
      <InvoiceFields
        invoice={invoice}
        disabled={action.latest?.status === 'pending'}
      />
      <div>
        <Link
          search={(old) => ({
            ...old,
            showNotes: old?.showNotes ? undefined : true,
          })}
          className="text-blue-700 "
        >
          {search.showNotes ? 'Close Notes' : 'Show Notes'}{' '}
        </Link>
        {search.showNotes ? (
          <>
            <div>
              <div className="h-2" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                className="shadow w-full p-2 rounded"
                placeholder="Write some notes here..."
              />
              <div className="italic text-xs">
                Notes are stored in the URL. Try copying the URL into a new tab!
              </div>
            </div>
          </>
        ) : null}
      </div>
      <div>
        <button
          className="bg-blue-500 rounded p-2 uppercase text-white font-black"
          disabled={action.latest?.status === 'pending'}
        >
          Save
        </button>
      </div>
      <div
        key={action.latest?.submittedAt}
        className="animate-bounce [animation-iteration-count:1.5] [animation-duration:.3s]"
      >
        {action.latest?.status === 'success' ? (
          <div className="inline-block px-2 py-1 rounded bg-green-500 text-white">
            Saved!
          </div>
        ) : action.latest?.status === 'error' ? (
          <div className="inline-block px-2 py-1 rounded bg-red-500 text-white">
            Failed to save.
          </div>
        ) : null}
      </div>
    </form>
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

function Users() {
  const { users } = useLoaderData()
  const navigate = useNavigate()
  const { usersView } = useSearch()

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
                to={user.id}
                className="block py-2 px-3 text-blue-700"
                getActiveProps={() => ({ className: `font-bold` })}
              >
                <pre className="text-sm">
                  {user.name}{' '}
                  <MatchRoute to={user.id} pending>
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
}

function UserView() {
  const { user } = useLoaderData()

  return (
    <>
      <h4 className="p-2 font-bold">{user?.name}</h4>
      <pre className="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
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

function Auth() {
  const auth = useAuth()
  const [username, setUsername] = React.useState('')

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    auth.login(username)
  }

  return auth.status === 'loggedIn' ? (
    <Outlet />
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
}

function Authenticated() {
  const auth = useAuth()

  return (
    <div className="p-2">
      You're authenticated! Your username is <strong>{auth.username}</strong>
      <div className="h-2" />
      <button
        onClick={() => auth.logout()}
        className="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
      >
        Log out
      </button>
      <div className="h-2" />
      <div>
        This authentication example is obviously very contrived and simple. It
        doesn't cover the use case of a redirected login page, but does
        illustrate how easy it is to simply wrap routes with ternary logic to
        either show a login prompt or redirect (probably with the `Navigate`
        component).
      </div>
    </div>
  )
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
