import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from './router'
import './styles.css'
import type { Price, Product } from '@route-modules/products/api'

// Fixture data: every price is derived from the product id.
const product = (id: string): Product => ({
  id,
  name: `Product ${id}`,
  price: (([...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 90) +
    10) as Price,
})

const observedModuleMatches: Array<string | undefined> = []
Object.assign(window, { observedModuleMatches })
const router = createAppRouter(
  {
    getProduct: (id) => Promise.resolve(product(id)),
    listProducts: () =>
      Promise.resolve([product('1'), product('2'), product('3')]),
  },
  (routeId) => observedModuleMatches.push(routeId),
)

ReactDOM.createRoot(document.getElementById('app')!).render(
  <RouterProvider router={router} />,
)
