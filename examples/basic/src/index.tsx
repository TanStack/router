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
  useIsNextLocation,
  useMatch,
  useRouter,
  useSearch,
  useNavigate,
} from "react-location";

//

type Invoice = {
  id: string;
  title: string;
  body: string;
};

type LocationGenerics = MakeGenerics<{
  LoaderData: {
    invoices: Invoice[];
    invoice: Invoice;
  };
  Search: {
    showNotes: boolean;
    notes: string;
  };
}>;

//

// Set up a ReactLocation instance
const location = new ReactLocation<LocationGenerics>({
  options: {
    defaultPendingElement: <Spinner />,
  },
});

// Build our routes. We could do this in our component, too.
const routes: Route[] = [
  { path: "/", element: <Home /> },
  {
    path: "dashboard",
    element: <Dashboard />,
    loader: async () => {
      return {
        invoices: await fetchInvoices(),
      };
    },
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
            loader: async ({ params: { invoiceId } }) => {
              return {
                invoice: await fetchInvoiceById(invoiceId),
              };
            },
          },
        ],
      },
      {
        path: "users",
        element: <Users />,
        loader: async () => {
          return {
            invoices: await fetchUsers(),
          };
        },
      },
    ],
  },
];

// Provide our location and routes to our application
function App() {
  // This stuff is just to tweak our sandbox setup in real-time
  const [delay, setDelay] = useLocalStorage("delay", 500);
  const [defaultPendingMs, setDefaultPendingMs] = useLocalStorage(
    "defaultPendingMs",
    1000
  );
  const [defaultPendingMinMs, setDefaulPendingMinMs] = useLocalStorage(
    "defaultPendingMinMs",
    500
  );
  const [defaultLinkPreloadMaxAge, setDefaultLinkPreloadMaxAge] =
    useLocalStorage("defaultLinkPreloadMaxAge", 0);
  const [defaultLoaderMaxAge, setDefaultLoaderMaxAge] = useLocalStorage(
    "defaultLoaderMaxAge",
    0
  );

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
        <div>
          Default Pending Ms: {defaultPendingMs}ms{" "}
          {defaultPendingMs > delay ? <>🔴</> : <>🟢</>}
        </div>
        <div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={defaultPendingMs}
            onChange={(e) => setDefaultPendingMs(e.target.valueAsNumber)}
            className={tw`w-full`}
          />
        </div>
        <div className={tw`${!defaultPendingMs ? "opacity-30" : ""}`}>
          <div>Default Min Pending Ms: {defaultPendingMinMs}ms</div>
          <div>
            <input
              type="range"
              min="0"
              max="5000"
              step="100"
              value={defaultPendingMinMs}
              onChange={(e) => setDefaulPendingMinMs(e.target.valueAsNumber)}
              className={tw`w-full`}
            />
          </div>
        </div>
        <div>
          Loader Max Age:{" "}
          {defaultLoaderMaxAge ? `${defaultLoaderMaxAge}ms` : "Off"}
        </div>
        <div>
          <input
            type="range"
            min="0"
            max="10000"
            step="250"
            value={defaultLoaderMaxAge}
            onChange={(e) => setDefaultLoaderMaxAge(e.target.valueAsNumber)}
            className={tw`w-full`}
          />
        </div>
        <div>
          Link Preload Max Age:{" "}
          {defaultLinkPreloadMaxAge ? `${defaultLinkPreloadMaxAge}ms` : "Off"}
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
            className={tw`w-full`}
          />
        </div>
      </div>
      {/* Normally <Router /> matches and renders our
      routes, but when we pass our own children, we can use
      <Outlet /> to start rendering our matches when we're
      // ready. This also let's us use router API's
      in <Root /> before rendering any routes */}
      <Router
        location={location}
        routes={routes}
        defaultLinkPreloadMaxAge={defaultLinkPreloadMaxAge}
        defaultLoaderMaxAge={defaultLoaderMaxAge}
        defaultPendingMs={defaultPendingMs}
        defaultPendingMinMs={defaultPendingMinMs}
        // Normally, the options above aren't changing, but for this particular
        // example, we need to key the router when they change
        key={[
          defaultLinkPreloadMaxAge,
          defaultLoaderMaxAge,
          defaultPendingMs,
          defaultPendingMinMs,
        ].join(".")}
      >
        <Root />
      </Router>
    </>
  );
}

function Root() {
  // We can access the router state, even though
  // we're not rendering any routes yet
  const router = useRouter<LocationGenerics>();

  return (
    <div className={tw`min-h-screen flex flex-col`}>
      <div className={tw`flex items-center border-b gap-2`}>
        <h1 className={tw`text-3xl p-2`}>Basic Example</h1>
        {/* Show a global spinner when the router is transitioning */}
        <Spinner show={!!router.nextTransition} />
      </div>
      <div className={tw`flex-1 flex`}>
        <div className={tw`divide-y w-56`}>
          {[
            [".", "Home"],
            ["dashboard", "Dashboard"],
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
        {[
          [".", "Summary"],
          ["invoices", "Invoices"],
          ["users", "Users"],
        ].map(([to, label]) => {
          return (
            <Link
              key={to}
              to={to}
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
      <div>
        <Outlet />
      </div>
    </>
  );
}

function DashboardHome() {
  const match = useMatch<LocationGenerics>();

  return (
    <div className={tw`p-2`}>
      <div className={tw`p-2`}>
        Welcome to the dashboard! You have{" "}
        <strong>{match.data.invoices?.length} total invoices</strong>.
      </div>
    </div>
  );
}

function Invoices() {
  const {
    data: { invoices },
  } = useMatch<LocationGenerics>();
  const isNextLocation = useIsNextLocation();

  return (
    <div className={tw`flex-1 flex`}>
      <div className={tw`divide-y w-48`}>
        {invoices?.map((invoice) => {
          return (
            <div key={invoice.id}>
              <Link
                to={invoice.id}
                className={tw`block py-2 px-3 text-blue-700`}
                getActiveProps={() => ({ className: tw`font-bold` })}
              >
                <pre className={tw`text-sm`}>
                  #{invoice.id} - {invoice.title.slice(0, 10)}{" "}
                  {isNextLocation({ to: invoice.id }) ? "..." : ""}
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

function Invoice() {
  const {
    data: { invoice },
  } = useMatch<LocationGenerics>();
  const isNextLocation = useIsNextLocation();
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
      <div>
        <Link to="../" className={tw`italic text-red-500`}>
          Close {isNextLocation({ to: "../" }) ? "..." : ""}
        </Link>
      </div>
      <h4 className={tw`font-bold`}>{invoice?.title}</h4>
      <div>
        <p>{invoice?.body}</p>
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

function Users() {
  return (
    <>
      <div className={tw`p-2`}>Just you for now!</div>
    </>
  );
}

function Spinner({
  show = true,
  className = "",
}: {
  show?: any;
  className?: string;
}) {
  return (
    <div
      className={tw`inline-block animate-spin px-3 text-xl`}
      style={{
        opacity: show ? 1 : 0,
        transitionDuration: show ? "1000" : "0",
      }}
    >
      ⍥
    </div>
  );
}

async function fetchInvoices() {
  const { data } = await delayFn(() =>
    axios.get("https://jsonplaceholder.typicode.com/posts")
  );

  return data.slice(0, 25);
}

async function fetchInvoiceById(id: string) {
  const { data } = await delayFn(() =>
    axios.get(`https://jsonplaceholder.typicode.com/posts/${id}`)
  );

  return { ...data, body: data.body + " " + Date.now() };
}

async function fetchUsers() {
  const { data } = await delayFn(() =>
    axios.get("https://jsonplaceholder.typicode.com/users")
  );

  return data;
}

async function delayFn<T>(fn: (...args: any[]) => Promise<T>) {
  const delayPromise = new Promise((r) =>
    setTimeout(r, Number(sessionStorage.getItem("delay") ?? 0))
  );

  const [res] = await Promise.all([fn(), delayPromise]);

  return res;
}

function useLocalStorage<T>(key: string, initialValue: T) {
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
