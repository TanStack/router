/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import { tw } from "twind";
import {
  Link,
  MakeGenerics,
  Outlet,
  ReactLocation,
  Router,
  Route,
  useMatch,
  useRouter,
  useSearch,
  useNavigate,
} from "@tanstack/react-location-lite-experimental";
import { ReactLocationDevtools } from "@tanstack/react-location-devtools";
import {
  useQuery,
  QueryClient,
  QueryClientProvider,
  useIsFetching,
} from "react-query";
import { ReactQueryDevtools } from "react-query/devtools";

const Expensive = React.lazy(() => delayFn(() => import("./Expensive")));

//

type Invoice = {
  id: string;
  title: string;
  body: string;
};

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  address: Address;
  phone: string;
  website: string;
  company: Company;
}
export interface Address {
  street: string;
  suite: string;
  city: string;
  zipcode: string;
  geo: Geo;
}

export interface Geo {
  lat: string;
  lng: string;
}

export interface Company {
  name: string;
  catchPhrase: string;
  bs: string;
}

type UsersViewSortBy = "name" | "id" | "email";

export type LocationGenerics = MakeGenerics<{
  Params: {
    invoiceId: string;
    userId: string;
  };
  Search: {
    showNotes: boolean;
    notes: string;
    usersView: {
      sortBy?: UsersViewSortBy;
      filterBy?: string;
    };
  };
}>;

//

// Set up a ReactLocation instance
const location = new ReactLocation<LocationGenerics>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      suspense: true,
    },
  },
});

// Build our routes. We could do this in our component, too.
const routes: Route<LocationGenerics>[] = [
  { path: "/", element: <Home /> },
  {
    path: "dashboard",
    element: <Dashboard />,
    children: [
      { path: "/", element: <DashboardHome /> },
      {
        path: "invoices",
        element: <Invoices />,
        children: [
          { path: "/", element: <InvoicesHome /> },
          {
            path: ":invoiceId",
            element: <Invoice />,
          },
        ],
      },
      {
        path: "users",
        element: <Users />,
        searchFilters: [
          // Keep the usersView search param around
          // while in this route (or it's children!)
          (search) => ({
            ...search,
            usersView: search.usersView,
          }),
        ],
        children: [
          {
            path: ":userId",
            element: <User />,
          },
        ],
      },
    ],
  },
  {
    // Your elements can be asynchronous, which means you can code-split!
    path: "expensive",
    element: <Expensive />,
  },
  {
    path: "authenticated/",
    element: <Auth />,
    children: [
      {
        path: "/",
        element: <Authenticated />,
      },
    ],
  },
];

// Provide our location and routes to our application
function App() {
  // This stuff is just to tweak our sandbox setup in real-time
  const [delay, setDelay] = useSessionStorage("delay", 500);

  return (
    <>
      {/* More stuff to tweak our sandbox setup in real-time */}
      <div
        className={tw`text-xs fixed w-52 shadow rounded bottom-2 left-2 bg-white bg-opacity-75 p-2 border-b flex flex-col gap-2 flex-wrap items-left`}
      >
        <div>Artificial Delay: {delay}ms</div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={delay}
            onChange={(e) => setDelay(e.target.valueAsNumber)}
            className={tw`w-full`}
          />
        </div>
      </div>
      {/* Normally <Router /> matches and renders our
      routes, but when we pass our own children, we can use
      <Outlet /> to start rendering our matches when we're
      // ready. This also let's us use router API's
      in <Root /> before rendering any routes */}
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <React.Suspense fallback="...">
            <Router
              location={location}
              routes={routes}
              defaultPendingElement={
                <div className={tw`text-2xl`}>
                  <Spinner />
                </div>
              }
              // defaultLinkPreloadMaxAge={defaultLinkPreloadMaxAge}
              // defaultLoaderMaxAge={defaultLoaderMaxAge}
              // defaultPendingMs={defaultPendingMs}
              // defaultPendingMinMs={defaultPendingMinMs}
              // Normally, the options above aren't changing, but for this particular
              // example, we need to key the router when they change
            >
              <Root />
              <ReactLocationDevtools
                position="bottom-right"
                useRouter={useRouter}
              />
              <ReactQueryDevtools
                position="bottom-right"
                toggleButtonProps={{
                  style: {
                    marginRight: "4rem",
                  },
                }}
              />
            </Router>
          </React.Suspense>
        </QueryClientProvider>
      </AuthProvider>
    </>
  );
}

function Root() {
  // We can access the router state, even though
  // we're not rendering any routes yet
  const isFetching = useIsFetching();

  return (
    <div className={tw`min-h-screen flex flex-col`}>
      <div className={tw`flex items-center border-b gap-2`}>
        <h1 className={tw`text-3xl p-2`}>Kitchen Sink</h1>
        {/* Show a global spinner when the router is transitioning */}
        <div
          className={tw`text-3xl duration-100 delay-0 opacity-0 ${
            isFetching ? `delay-500 duration-300 opacity-40` : ""
          }`}
        >
          <Spinner />
        </div>
      </div>
      <div className={tw`flex-1 flex`}>
        <div className={tw`divide-y w-56`}>
          {[
            [".", "Home"],
            ["dashboard", "Dashboard"],
            ["expensive", "Expensive"],
            ["authenticated/", "Authenticated"], // This route has a trailing slash on purpose.
          ].map(([to, label]) => {
            return (
              <div key={to}>
                <Link
                  to={to}
                  className={tw`block py-2 px-3 text-blue-700`}
                  // Make "active" links bold
                  getActiveProps={() => ({ className: tw`font-bold` })}
                  activeOptions={{
                    // If the route points to the root of it's parent,
                    // make sure it's only active if it's exact
                    exact: to === ".",
                  }}
                >
                  {label}
                </Link>
              </div>
            );
          })}
        </div>
        <div className={tw`flex-1 border-l border-gray-200`}>
          {/* Render our first route match */}
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className={tw`p-2`}>
      <div className={tw`text-lg`}>Welcome Home!</div>
      <hr className={tw`my-2`} />
      <Link
        to="dashboard/invoices/3"
        className={tw`py-1 px-2 text-xs bg-blue-500 text-white rounded-full`}
      >
        1 New Invoice
      </Link>
      <hr className={tw`my-2`} />
      <div className={tw`max-w-xl`}>
        As you navigate around take note of the UX. It should feel
        suspense-like, where routes are only rendered once all of their data and
        elements are ready.
        <hr className={tw`my-2`} />
        To exaggerate async effects, play with the artificial request delay
        slider in the bottom-left corner. You can also play with the default
        timings for displaying the pending fallbacks and the minimum time any
        pending fallbacks will remain shown.
        <hr className={tw`my-2`} />
        The last 2 sliders determine if link-hover preloading is enabled (and
        how long those preloads stick around) and also whether to cache rendered
        route data (and for how long). Both of these default to 0 (or off).
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <div className={tw`flex items-center border-b`}>
        <h2 className={tw`text-xl p-2`}>Dashboard</h2>
        <Link
          to="./invoices/3"
          className={tw`py-1 px-2 text-xs bg-blue-500 text-white rounded-full`}
        >
          1 New Invoice
        </Link>
      </div>
      <div className={tw`flex flex-wrap divide-x`}>
        {(
          [
            [".", "Summary"],
            ["invoices", "Invoices"],
            ["users", "Users", true],
          ] as const
        ).map(([to, label, search]) => {
          return (
            <Link
              key={to}
              to={to}
              search={search}
              className={tw`inline-block py-2 px-3 text-blue-700`}
              activeOptions={{ exact: to === "." }}
              getActiveProps={() => ({ className: tw`font-bold` })}
            >
              {label}
            </Link>
          );
        })}
      </div>
      <hr />
      <Outlet />
    </>
  );
}

function useInvoicesQuery() {
  return useQuery("invoices", () => fetchInvoices());
}

function DashboardHome() {
  const invoicesQuery = useInvoicesQuery();

  return (
    <div className={tw`p-2`}>
      <div className={tw`p-2`}>
        Welcome to the dashboard! You have{" "}
        <strong>{invoicesQuery.data?.length} total invoices</strong>.
      </div>
    </div>
  );
}

function Invoices() {
  const invoicesQuery = useInvoicesQuery();

  return (
    <div className={tw`flex-1 flex`}>
      <div className={tw`divide-y w-48`}>
        {invoicesQuery.data?.map((invoice) => {
          return (
            <div key={invoice.id}>
              <Link
                to={invoice.id}
                className={tw`block py-2 px-3 text-blue-700`}
                getActiveProps={() => ({ className: tw`font-bold` })}
              >
                <pre className={tw`text-sm`}>
                  #{invoice.id} - {invoice.title.slice(0, 10)}
                </pre>
              </Link>
            </div>
          );
        })}
      </div>
      <div className={tw`flex-1 border-l border-gray-200`}>
        <Outlet />
      </div>
    </div>
  );
}

function InvoicesHome() {
  return (
    <>
      <div className={tw`p-2`}>Select an invoice.</div>
    </>
  );
}

function useInvoiceByIdQuery(invoiceId: string) {
  return useQuery(["invoices", invoiceId], () => fetchInvoiceById(invoiceId));
}

function Invoice() {
  const {
    params: { invoiceId },
  } = useMatch<LocationGenerics>();
  const invoiceQuery = useInvoiceByIdQuery(invoiceId);
  const search = useSearch<LocationGenerics>();
  const navigate = useNavigate();

  const [notes, setNotes] = React.useState(search.notes ?? ``);

  React.useEffect(() => {
    navigate({
      search: (old) => ({ ...old, notes: notes ? notes : undefined }),
      replace: true,
    });
  }, [notes]);

  return (
    <div className={tw`p-2`}>
      <h4 className={tw`font-bold`}>{invoiceQuery.data?.title}</h4>
      <div>
        <p>{invoiceQuery.data?.body}</p>
      </div>
      <hr className={tw`my-2`} />
      <Link
        search={(old) => ({
          ...old,
          showNotes: old?.showNotes ? undefined : true,
        })}
        className={tw`text-blue-700 `}
      >
        {search.showNotes ? "Close Notes" : "Show Notes"}{" "}
      </Link>
      {search.showNotes ? (
        <>
          <div>
            <div className={tw`h-2`} />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className={tw`shadow w-full p-2 rounded`}
              placeholder={`Write some notes here...`}
            />
            <div className={tw`italic text-xs`}>
              Notes are stored in the URL. Try copying the URL into a new tab!
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function useUsersQuery() {
  return useQuery(["users"], () => fetchUsers());
}

function Users() {
  const usersQuery = useUsersQuery();
  const navigate = useNavigate<LocationGenerics>();
  const { usersView } = useSearch<LocationGenerics>();

  const sortBy = usersView?.sortBy ?? "name";
  const filterBy = usersView?.filterBy;

  const [filterDraft, setFilterDraft] = React.useState(filterBy ?? "");

  const sortedUsers = React.useMemo(() => {
    if (!usersQuery.data) return [];

    return !sortBy
      ? usersQuery.data
      : [...usersQuery.data].sort((a, b) => {
          return a[sortBy] > b[sortBy] ? 1 : -1;
        });
  }, [usersQuery.data, sortBy]);

  const filteredUsers = React.useMemo(() => {
    if (!filterBy) return sortedUsers;

    return sortedUsers.filter((user) =>
      user.name.toLowerCase().includes(filterBy.toLowerCase())
    );
  }, [sortedUsers, filterBy]);

  const setSortBy = (sortBy: UsersViewSortBy) =>
    navigate({
      search: (old) => {
        return {
          ...old,
          usersView: {
            ...(old?.usersView ?? {}),
            sortBy,
          },
        };
      },
      replace: true,
    });

  React.useEffect(() => {
    navigate({
      search: (old) => {
        return {
          ...old,
          usersView: {
            ...old?.usersView,
            filterBy: filterDraft || undefined,
          },
        };
      },
      replace: true,
    });
  }, [filterDraft]);

  return (
    <div className={tw`flex-1 flex`}>
      <div className={tw`divide-y`}>
        <div className={tw`py-2 px-3 flex gap-2 items-center bg-gray-100`}>
          <div>Sort By:</div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as UsersViewSortBy)}
            className={tw`flex-1 border p-1 px-2 rounded`}
          >
            {["name", "id", "email"].map((d) => {
              return <option key={d} value={d} children={d} />;
            })}
          </select>
        </div>
        <div className={tw`py-2 px-3 flex gap-2 items-center bg-gray-100`}>
          <div>Filter By:</div>
          <input
            value={filterDraft}
            onChange={(e) => setFilterDraft(e.target.value)}
            placeholder="Search Names..."
            className={tw`min-w-0 flex-1 border p-1 px-2 rounded`}
          />
        </div>
        {filteredUsers?.map((user) => {
          return (
            <div key={user.id}>
              <Link<LocationGenerics>
                to={user.id}
                className={tw`block py-2 px-3 text-blue-700`}
                getActiveProps={() => ({ className: tw`font-bold` })}
              >
                <pre className={tw`text-sm`}>{user.name}</pre>
              </Link>
            </div>
          );
        })}
      </div>
      <div className={tw`flex-initial border-l border-gray-200`}>
        <Outlet />
      </div>
    </div>
  );
}

function useUserByIdQuery(userId: string) {
  return useQuery(["users", userId], () => fetchUserById(userId));
}

function User() {
  const {
    params: { userId },
  } = useMatch<LocationGenerics>();
  const useQuery = useUserByIdQuery(userId);

  return (
    <>
      <h4 className={tw`p-2 font-bold`}>{useQuery.data?.name}</h4>
      <pre className={tw`text-sm whitespace-pre-wrap`}>
        {JSON.stringify(useQuery.data, null, 2)}
      </pre>
    </>
  );
}

type AuthContext = {
  login: (username: string) => void;
  logout: () => void;
} & AuthContextState;

type AuthContextState = {
  status: "loggedOut" | "loggedIn";
  username?: string;
};

const AuthContext = React.createContext<AuthContext>(null!);

function AuthProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthContextState>({
    status: "loggedOut",
  });

  const login = (username: string) => {
    setState({ status: "loggedIn", username });
  };

  const logout = () => {
    setState({ status: "loggedOut" });
  };

  const contextValue = React.useMemo(
    () => ({
      ...state,
      login,
      logout,
    }),
    [state]
  );

  return (
    <AuthContext.Provider value={contextValue} children={props.children} />
  );
}

function useAuth() {
  return React.useContext(AuthContext);
}

function Auth() {
  const auth = useAuth();
  const [username, setUsername] = React.useState("");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    auth.login(username);
  };

  return auth.status === "loggedIn" ? (
    <Outlet />
  ) : (
    <div className={tw`p-2`}>
      <div>You must log in!</div>
      <div className={tw`h-2`} />
      <form onSubmit={onSubmit} className={tw`flex gap-2`}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className={tw`border p-1 px-2 rounded`}
        />
        <button
          onClick={() => auth.logout()}
          className={tw`text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded`}
        >
          Login
        </button>
      </form>
    </div>
  );
}

function Authenticated() {
  const auth = useAuth();

  return (
    <div className={tw`p-2`}>
      You're authenticated! Your username is <strong>{auth.username}</strong>
      <div className={tw`h-2`} />
      <button
        onClick={() => auth.logout()}
        className={tw`text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded`}
      >
        Log out
      </button>
      <div className={tw`h-2`} />
      <div>
        This authentication example is obviously very contrived and simple. It
        doesn't cover the use case of a redirected login page, but does
        illustrate how easy it is to simply wrap routes with ternary logic to
        either show a login prompt or redirect (probably with the `Navigate`
        component).
      </div>
    </div>
  );
}

function Spinner() {
  return <div className={tw`inline-block animate-spin px-3`}>⍥</div>;
}

async function fetchInvoices() {
  const { data } = await delayFn(() =>
    axios.get<Invoice[]>("https://jsonplaceholder.typicode.com/posts")
  );

  return data.slice(0, 25);
}

async function fetchInvoiceById(id: string) {
  const { data } = await delayFn(() =>
    axios.get<Invoice>(`https://jsonplaceholder.typicode.com/posts/${id}`)
  );

  return { ...data, body: data.body + " " + Date.now() };
}

async function fetchUsers() {
  const { data } = await delayFn(() =>
    axios.get<User[]>("https://jsonplaceholder.typicode.com/users")
  );

  return data;
}

async function fetchUserById(id: string) {
  const { data } = await delayFn(() =>
    axios.get<User>(`https://jsonplaceholder.typicode.com/users/${id}`)
  );

  return data;
}

export async function delayFn<T>(fn: (...args: any[]) => Promise<T> | T) {
  const delay = Number(sessionStorage.getItem("delay") ?? 0);
  const delayPromise = new Promise((r) => setTimeout(r, delay));

  const [res] = await Promise.all([fn(), delayPromise]);

  return res;
}

function useSessionStorage<T>(key: string, initialValue: T) {
  const state = React.useState<T>(() => {
    const stored = sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  React.useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(state[0]));
  }, [state[0]]);

  return state;
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
