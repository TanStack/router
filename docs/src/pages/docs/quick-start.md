---
id: quick-start
title: Quick Start
---

## Quick Start

React

The following example displays generally:

- Route Definitions
- Links
- Rendering Routes
- Route Loaders
- Route Layout Elements
- URL Search Params
- Path Params

Each concept will be discussed further in the API documentation, so don't get too ahead of yourself here!

```tsx
import { React } from 'react'
import { ReactLocation, Routes, Link, useRoute } from 'react-location'

export function App() {
  return (
    <ReactLocation>
      <nav>
        <Link to="/">Home</Link>
        <Link to="dashboard">Dashboard</Link>
        <Link to="invoices">Invoices</Link>
        {/* React Location doesn't handle external links ;) */}
        <a href="https://github.com/tannerlinsley/react-location">
          Github - React Location
        </a>
      </nav>
      <div>
        <Routes
          routes={[
            {
              path: '/',
              element: <Home />,
            },
            {
              path: 'dashboard',
              element: <Dashboard />,
            },
            {
              path: 'invoices',
              element: <Invoices />, // Renders our Invoices Wrapper
              // Load invoices before rendering
              load: async () => ({
                invoices: await fetchInvoices(),
              }),
              children: [
                {
                  path: 'new',
                  element: <NewInvoice />,
                },
                {
                  path: ':invoiceId',
                  element: <Invoice />,
                  // Load the individual invoice before rendering
                  load: async ({ params }) => ({
                    invoice: await fetchInvoiceById(params.invoiceId),
                  }),
                },
              ],
            },
          ]}
        />
      </div>
    </ReactLocation>
  )
}

function Home() {
  return <div>This is Home</div>
}

function Dashboard() {
  return <div>This is the Dashboard</div>
}

function Invoices() {
  const {
    data: { invoices },
  } = useRoute()

  return (
    <>
      <div>Invoices</div>
      <ul>
        <li>
          <Link to="new">New Invoice</Link>
        </li>
        {invoices.map(invoice => {
          return (
            <li key={invoice.id}>
              <Link to={invoice.id}>{invoice.id}</Link>
            </li>
          )
        })}
      </ul>

      <Outlet />
    </>
  )
}

function NewInvoice() {
  return (
    <>
      <Link to="..">Back</Link>
      <div>This is a new invoice!</div>
    </>
  )
}

function Invoice() {
  // Route Info
  const {
    data: { invoice },
  } = useRoute()

  // Search
  const search = useSearch<{
    view?: { expanded?: boolean; isOpen?: boolean }
  }>()

  // Programmatic Navigation
  const navigate = useNavigate()

  const isOpen = search.view?.isOpen

  const togglePreview = () =>
    navigate({
      // Functional updates to search params
      search: old => ({
        ...old,
        view: {
          ...(old.view ?? {}),
          isOpen: !old.view.isOpen,
        },
      }),
    })

  return (
    <div>
      <Link to="..">Back</Link>
      <div>Invoice: #{invoice.id}</div>
      <div>
        <button onClick={togglePreview}>
          {isOpen ? 'Hide' : 'Show'} Preview
        </button>
      </div>
      {isOpen ? <div>This is a preview!</div> : null}
    </div>
  )
}
```
