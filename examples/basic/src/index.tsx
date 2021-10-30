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
  useMatches,
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
    details: boolean;
  };
}>;

//

const storedDelay = localStorage.getItem("delay");
let globalDelay = storedDelay ? Number(storedDelay) : 500;

const location = new ReactLocation<LocationGenerics>({
  defaultLoaderMaxAge: 1000,
  defaultLinkPreloadMaxAge: 1000 * 3,
});

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
        loader: async () => {
          return {
            invoices: await fetchInvoices(),
          };
        },
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

function App() {
  return (
    <Router location={location} routes={routes}>
      <Root />
    </Router>
  );
}

function Root() {
  const router = useRouter<LocationGenerics>();
  const [delay, setDelay] = React.useState(globalDelay);

  React.useEffect(() => {
    globalDelay = delay;
    localStorage.setItem("delay", delay + "");
  }, [delay]);

  return (
    <div className={tw`min-h-screen flex flex-col`}>
      <div className={tw`flex items-center border-b gap-2`}>
        <h1 className={tw`text-3xl p-2`}>Basic Example</h1>
        <Spinner show={router.nextTransition} />
        <div className={tw`ml-auto mr-2`}>
          <label>
            Delay: {delay}ms{" "}
            <input
              type="range"
              min="0"
              max="10000"
              step="250"
              value={delay}
              onChange={(e) => setDelay(e.target.valueAsNumber)}
            />
          </label>
        </div>
      </div>
      <div className={tw`flex-1 flex`}>
        <div className={tw`divide-y w-48`}>
          {[
            [".", "Home"],
            ["dashboard", "Dashboard"],
          ].map(([to, label]) => {
            return (
              <div key={to}>
                <Link
                  to={to}
                  className={tw`block py-2 px-3 text-blue-700`}
                  activeOptions={{ exact: to === "." }}
                  getActiveProps={() => ({ className: tw`font-bold` })}
                >
                  {label}
                </Link>
              </div>
            );
          })}
        </div>
        <div className={tw`flex-1 border-l border-gray-200`}>
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
      <Link search={(old) => ({ ...old, details: !old?.details })}>
        {search.details ? "Close Details" : "Show Details"}{" "}
      </Link>
      {search.details ? (
        <>
          <hr />
          <div>
            <label>
              Notes: <textarea />
            </label>
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

function Spinner({ show }: { show: any }) {
  return (
    <div
      className={tw`animate-spin px-3 text-xl`}
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
  await new Promise((r) => setTimeout(r, globalDelay));
  const { data } = await axios.get(
    "https://jsonplaceholder.typicode.com/posts"
  );
  return data.slice(0, 25);
}

async function fetchInvoiceById(id: string) {
  await new Promise((r) => setTimeout(r, globalDelay));
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return { ...data, body: data.body + " " + Date.now() };
}

async function fetchUsers() {
  await new Promise((r) => setTimeout(r, globalDelay));
  const { data } = await axios.get(
    "https://jsonplaceholder.typicode.com/users"
  );
  return data;
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
