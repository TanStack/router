import { createFileRoute } from '@tanstack/react-router'
import {
  gql,
  TypedDocumentNode,
  useSuspenseQuery,
} from '@apollo/client/index.js'

export const Route = createFileRoute('/')({
  component: Home,
})

const GET_LATEST_PRODUCTS: TypedDocumentNode<{
  products: { id: string }[]
}> = gql`
  query HomepageProducts {
    products {
      id
    }
  }
`

function Home() {
  const { data } = useSuspenseQuery(GET_LATEST_PRODUCTS)
  return (
    <div className="p-2">
      <h3>Welcome Home!!! {JSON.stringify(data)}</h3>
    </div>
  )
}
