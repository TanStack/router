export type Product = {
  id: string
  name: string
  price: number
  description: string
}

export const products: Array<Product> = [
  {
    id: 'router-hoodie',
    name: 'Router Hoodie',
    price: 59,
    description: 'Type-safe from the hood down to the hem.',
  },
  {
    id: 'remote-mug',
    name: 'Remote Mug',
    price: 18,
    description: 'Loaded at runtime, refilled without redeploying the host.',
  },
  {
    id: 'singleton-socks',
    name: 'Singleton Socks',
    price: 12,
    description: 'Exactly one pair is ever shared across the whole app.',
  },
]

export function findProduct(id: string) {
  return products.find((product) => product.id === id)
}
