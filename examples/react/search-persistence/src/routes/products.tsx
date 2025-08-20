import { createFileRoute, useNavigate, persistSearchParams, } from '@tanstack/react-router'
import { z } from 'zod'
import React from 'react'

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
      persistSearchParams(['sortBy']), // Exclude 'sortBy' from persistence - fully typed!
    ],
  },
  component: ProductsComponent,
})

const mockProducts = [
  { id: 1, name: 'Laptop', category: 'Electronics', price: 999, rating: 4.5 },
  { id: 2, name: 'Chair', category: 'Home', price: 199, rating: 4.2 },
  { id: 3, name: 'Phone', category: 'Electronics', price: 699, rating: 4.7 },
  { id: 4, name: 'Desk', category: 'Home', price: 299, rating: 4.0 },
  { id: 5, name: 'Tablet', category: 'Electronics', price: 399, rating: 4.3 },
  { id: 6, name: 'Lamp', category: 'Home', price: 79, rating: 4.1 },
]

function ProductsComponent() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const filteredProducts = React.useMemo(() => {
    let products = [...mockProducts]

    if (search.category) {
      products = products.filter(product => product.category === search.category)
    }

    products = products.filter(product => 
      product.price >= (search.minPrice ?? 0) && product.price <= (search.maxPrice ?? 1000)
    )

    products = products.sort((a, b) => {
      if (search.sortBy === 'name') return a.name.localeCompare(b.name)
      if (search.sortBy === 'price') return a.price - b.price
      if (search.sortBy === 'rating') return b.rating - a.rating
      return 0
    })

    return products
  }, [search.category, search.minPrice, search.maxPrice, search.sortBy])

  const updateSearch = (updates: Partial<ProductsSearchSchema>) => {
    navigate({
      search: (prev: ProductsSearchSchema) => ({ ...prev, ...updates }),
    } as any)
  }

  return (
    <div className="p-2">
      <h3>Products</h3>
      <p>Advanced filtering with excluded parameters (sortBy won't persist)</p>
      
      <div className="mt-4 space-y-2">
        <select
          value={search.category || ''}
          onChange={(e) => updateSearch({ category: e.target.value })}
          className="border p-2 rounded"
        >
          <option value="">All Categories</option>
          <option value="Electronics">Electronics</option>
          <option value="Home">Home</option>
        </select>
        
        <div className="flex gap-2">
          <input
            type="range"
            min="0"
            max="1000"
            value={search.minPrice ?? 0}
            onChange={(e) => updateSearch({ minPrice: Number(e.target.value) })}
            className="border"
          />
          <span>Min: ${search.minPrice ?? 0}</span>
        </div>
        
        <div className="flex gap-2">
          <input
            type="range"
            min="0"
            max="1000"
            value={search.maxPrice ?? 1000}
            onChange={(e) => updateSearch({ maxPrice: Number(e.target.value) })}
            className="border"
          />
          <span>Max: ${search.maxPrice ?? 1000}</span>
        </div>
        
        <select
          value={search.sortBy || 'name'}
          onChange={(e) => updateSearch({ sortBy: e.target.value as any })}
          className="border p-2 rounded"
        >
          <option value="name">Sort by Name</option>
          <option value="price">Sort by Price</option>
          <option value="rating">Sort by Rating</option>
        </select>
        
        <button
          type="button"
          onClick={() => navigate({ search: {} } as any)}
          className="border p-2 rounded"
        >
          Reset
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {filteredProducts.map((product) => (
          <div key={product.id} className="border p-2 rounded">
            <div className="font-bold">{product.name}</div>
            <div className="text-sm text-gray-600">{product.category}</div>
            <div className="text-sm">${product.price} - ⭐ {product.rating}</div>
          </div>
        ))}
      </div>
    </div>
  )
}