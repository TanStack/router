import * as React from 'react'
import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { gql, useReadQuery } from '@apollo/client'
import type { TypedDocumentNode } from '@apollo/client'

export type PostType = {
  id: string
  title: string
  body: string
}

const GET_LOCATIONS: TypedDocumentNode<{
  locations: Array<{
    id: string
    name: string
    description: string
    photo: string
  }>
}> = gql`
  query GetLocations {
    locations {
      id
      name
      description
      photo
    }
  }
`

export const Route = createFileRoute('/posts')({
  loader: async ({ context: { preloadQuery } }) => {
    console.log('Fetching locations...')
    return {
      /**
       * This creates a `QueryRef` object.
       * This object is not serializable by default,
       * so we'd love to be able to hook into the
       * serialization process to provide our own serialization.
       *
       * The serialized value will contain static values and a Promise,
       * although an AsyncIterator or some kind of Stream would be
       * preferrable.
       */
      locationsRef: preloadQuery(GET_LOCATIONS),
    }
  },
  component: PostsComponent,
})

function PostsComponent() {
  /**
   * `locationsRef` needs to be deserialized here.
   * But it doesn't only need to be deserialized:
   * The deserialization also has a side effect.
   *
   * The QueryRef needs to be registered with the ApolloClient.
   *
   */
  const { locationsRef } = Route.useLoaderData()

  const { data } = useReadQuery(locationsRef)

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {data.locations.map(({ id, name, description, photo }) => (
          <div key={id}>
            <h3>{name}</h3>
            <img
              width="400"
              height="250"
              alt="location-reference"
              src={`${photo}`}
            />
            <br />
            <b>About this location:</b>
            <p>{description}</p>
            <br />
          </div>
        ))}
        <li className="whitespace-nowrap">
          <Link
            to="/posts/$postId"
            params={{
              postId: 'does-not-exist',
            }}
            className="block py-1 text-blue-800 hover:text-blue-600"
            activeProps={{ className: 'text-black font-bold' }}
          >
            <div>This post does not exist</div>
          </Link>
        </li>
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
