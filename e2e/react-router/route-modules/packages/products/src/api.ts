export type Price = number & { readonly __brand: 'Price' }

export interface Product {
  id: string
  name: string
  price: Price
}

export interface ProductsApi {
  getProduct: (id: string) => Promise<Product>
  listProducts: () => Promise<Array<Product>>
}
