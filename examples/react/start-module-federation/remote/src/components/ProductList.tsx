import { Link } from '@tanstack/react-router'
import { products } from '~/products'
import './catalog.css'

export default function ProductList() {
  return (
    <section className="catalog">
      <span className="catalog-badge">Rendered by the catalog remote</span>
      <h2>Products</h2>
      <ul className="catalog-grid">
        {products.map((product) => (
          <li key={product.id}>
            <Link
              className="catalog-card"
              to="/products/$productId"
              params={{ productId: product.id }}
            >
              <strong>{product.name}</strong>
              <p className="catalog-price">${product.price}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
