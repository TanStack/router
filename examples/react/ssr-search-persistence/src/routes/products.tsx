import {
  createFileRoute,
  persistSearchParams,
  useNavigate,
} from '@tanstack/react-router'
import { z } from 'zod'

const productsSearchSchema = z.object({
  category: z.string().optional().catch(''),
  minPrice: z.number().optional().catch(0),
  maxPrice: z.number().optional().catch(1000),
  sortBy: z.enum(['name', 'price', 'rating']).optional().catch('name'),
})

export type ProductsSearchSchema = z.infer<typeof productsSearchSchema>

export const Route = createFileRoute('/products')({
  validateSearch: productsSearchSchema,
  search: {
    middlewares: [
      persistSearchParams(['category', 'minPrice', 'maxPrice'], ['sortBy']),
    ],
  },
  component: ProductsComponent,
})

function ProductsComponent() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const updateSearch = (updates: Partial<ProductsSearchSchema>) => {
    navigate({ search: { ...search, ...updates } })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-4">Products</h2>
        <div className="bg-green-50 p-3 rounded text-sm">
          <strong>Persisted:</strong> category, minPrice, maxPrice |
          <strong> Excluded:</strong> sortBy (temporary filter)
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              value={search.category || ''}
              onChange={(e) => updateSearch({ category: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">All Categories</option>
              <option value="electronics">Electronics</option>
              <option value="books">Books</option>
              <option value="clothing">Clothing</option>
              <option value="home">Home & Garden</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Min Price: ${search.minPrice || 0}
            </label>
            <input
              type="range"
              min="0"
              max="1000"
              step="10"
              value={search.minPrice || 0}
              onChange={(e) =>
                updateSearch({ minPrice: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Max Price: ${search.maxPrice || 1000}
            </label>
            <input
              type="range"
              min="0"
              max="1000"
              step="10"
              value={search.maxPrice || 1000}
              onChange={(e) =>
                updateSearch({ maxPrice: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Sort By (not persisted)
            </label>
            <select
              value={search.sortBy || 'name'}
              onChange={(e) =>
                updateSearch({
                  sortBy: e.target.value as ProductsSearchSchema['sortBy'],
                })
              }
              className="w-full border rounded px-3 py-2"
            >
              <option value="name">Name</option>
              <option value="price">Price</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          <button
            onClick={() => navigate({ search: {} })}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Clear All Filters
          </button>
        </div>

        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-semibold mb-2">Current Search State:</h3>
          <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
            {JSON.stringify(search, null, 2)}
          </pre>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded">
        <h3 className="font-semibold mb-2">🎯 Test Search Persistence</h3>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          <li>Set some filters above (category, price range)</li>
          <li>Navigate to Users page</li>
          <li>Come back - your filters should be restored!</li>
          <li>Notice: sortBy resets (not persisted) but others remain</li>
        </ol>
      </div>
    </div>
  )
}
