declare module 'catalog/ProductList' {
  import type { ComponentType } from 'react'

  const ProductList: ComponentType
  export default ProductList
}

declare module 'catalog/ProductDetail' {
  import type { ComponentType } from 'react'

  const ProductDetail: ComponentType<{ productId: string }>
  export default ProductDetail
}
