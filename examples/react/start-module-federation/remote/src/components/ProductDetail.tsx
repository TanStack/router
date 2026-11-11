import { Link } from '@tanstack/react-router'
import * as React from 'react'
import { findProduct } from '~/products'
import './catalog.css'

export type ProductDetailProps = {
  productId: string
}

export default function ProductDetail({ productId }: ProductDetailProps) {
  const product = findProduct(productId)
  const [quantity, setQuantity] = React.useState(1)

  return (
    <section className="catalog">
      <span className="catalog-badge">Rendered by the catalog remote</span>
      {product ? (
        <>
          <h2>{product.name}</h2>
          <p className="catalog-price">${product.price}</p>
          <p>{product.description}</p>
          <button
            type="button"
            className="catalog-button"
            onClick={() => setQuantity((value) => value + 1)}
          >
            Quantity: {quantity}
          </button>
        </>
      ) : (
        <h2>No product called "{productId}"</h2>
      )}
      <Link to="/products">Back to products</Link>
    </section>
  )
}
