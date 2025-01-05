import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  ErrorComponent,
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouteMask,
  createRouter,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import axios from 'redaxios'
import * as Dialog from '@radix-ui/react-dialog'
import type { ErrorComponentProps } from '@tanstack/react-router'

type PhotoType = {
  id: string
  title: string
  url: string
  thumbnailUrl: string
  albumId: string
}

class NotFoundError extends Error {}

const fetchPhotos = async () => {
  console.info('Fetching photos...')
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<Array<PhotoType>>('https://jsonplaceholder.typicode.com/photos')
    .then((r) => r.data.slice(0, 10))
}

const fetchPhoto = async (photoId: string) => {
  console.info(`Fetching photo with id ${photoId}...`)
  await new Promise((r) => setTimeout(r, 500))
  const photo = await axios
    .get<PhotoType>(`https://jsonplaceholder.typicode.com/photos/${photoId}`)
    .then((r) => r.data)
    .catch((err) => {
      if (err.status === 404) {
        throw new NotFoundError(`Photo with id "${photoId}" not found!`)
      }
      throw err
    })

  return photo
}

type PhotoModal = {
  id: 'photo'
  photoId: string
}

type ModalObject = PhotoModal

export function Spinner() {
  return (
    <div className="animate-spin px-3 text-xl inline-flex items-center justify-center">
      ⍥
    </div>
  )
}

const rootRoute = createRootRoute({
  validateSearch: (search) =>
    search as {
      modal?: ModalObject
    },
  component: RootComponent,
})

function RootComponent() {
  const status = useRouterState({ select: (s) => s.status })

  return (
    <>
      <div className="p-2 flex gap-2 text-lg">
        <Link
          to="/"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          Home
        </Link>{' '}
        <Link
          to="/photos"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Photos
        </Link>{' '}
        {status === 'pending' ? <Spinner /> : null}
      </div>
      <hr />
      <Outlet />
      {/* Start rendering router matches */}
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}

function Modal(props: Dialog.DialogProps) {
  return (
    <Dialog.Root open {...props}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70" />
        <Dialog.DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {props.children}
        </Dialog.DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return (
      <div className="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})
const photosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'photos',
  loader: fetchPhotos,
  component: PhotosRoute,
})

function PhotosRoute() {
  const photos = photosRoute.useLoaderData()

  return (
    <div className="p-2 space-y-2">
      <ul className="grid [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-2">
        {[
          ...photos,
          { id: 'i-do-not-exist', title: 'Missing Photo Test', url: '' },
        ].map((photo) => {
          return (
            <li key={photo.id} className="">
              <Link
                to={photoModalRoute.to}
                params={{
                  photoId: photo.id,
                }}
                // If you want to use a mask, you can do so like this, but
                // it's generally safer to set up a route mask instead.
                // mask={{
                //   to: photoRoute.to,
                //   params: {
                //     photoId: photo.id,
                //   },
                // }}
                className="whitespace-nowrap border rounded-lg shadow-sm flex items-center hover:shadow-lg text-blue-600 hover:scale-[1.1] overflow-hidden transition-all"
              >
                <img src={photo.url} alt={photo.title} className="max-w-full" />
              </Link>
            </li>
          )
        })}
      </ul>
      <Outlet />
    </div>
  )
}

const photoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'photos/$photoId',
  loader: async ({ params: { photoId } }) => fetchPhoto(photoId),
  errorComponent: PhotoErrorComponent,
  component: PhotoComponent,
})

function PhotoErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div className="p-4">
      {(() => {
        if (error instanceof NotFoundError) {
          return <div>{error.message}</div>
        }
        return <ErrorComponent error={error} />
      })()}
    </div>
  )
}

function PhotoComponent() {
  const photo = photoRoute.useLoaderData()

  return (
    <div className="p-4">
      <Photo photo={photo} />
    </div>
  )
}

const photoModalRoute = createRoute({
  getParentRoute: () => photosRoute,
  path: '$photoId/modal',
  loader: async ({ params: { photoId } }) => fetchPhoto(photoId),
  errorComponent: PhotoModalErrorComponent,
  // pendingComponent: PhotoModalPendingComponent,
  component: PhotoModalComponent,
})

function PhotoModalErrorComponent({ error }: ErrorComponentProps) {
  const navigate = useNavigate()

  return (
    <Modal
      onOpenChange={(open) => {
        if (!open) {
          navigate({
            to: photosRoute.to,
          })
        }
      }}
    >
      <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
        {(() => {
          if (error instanceof NotFoundError) {
            return <div>{error.message}</div>
          }
          return <ErrorComponent error={error} />
        })()}
      </div>
    </Modal>
  )
}

function PhotoModalPendingComponent() {
  const navigate = useNavigate()

  return (
    <Modal
      onOpenChange={(open) => {
        if (!open) {
          navigate({
            to: photosRoute.to,
          })
        }
      }}
    >
      <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
        <Spinner />
      </div>
    </Modal>
  )
}

function PhotoModalComponent() {
  const navigate = useNavigate()
  const photo = photoModalRoute.useLoaderData()

  return (
    <Modal
      onOpenChange={(open) => {
        if (!open) {
          navigate({
            to: photosRoute.to,
          })
        }
      }}
    >
      <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
        <Link
          to="."
          target="_blank"
          className="text-blue-600 hover:opacity-75 underline"
        >
          Open in new tab (to test de-masking)
        </Link>
        <Photo photo={photo} />
      </div>
    </Modal>
  )
}

function Photo({ photo }: { photo: PhotoType }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{photo.title}</h4>
      <div className="">
        <img src={photo.url} alt={photo.title} className="max-w-full" />
      </div>
    </div>
  )
}

const routeTree = rootRoute.addChildren([
  photoRoute,
  photosRoute.addChildren([photoModalRoute]),
  indexRoute,
])

const photoModalToPhotoMask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: true,
})

// Set up a Router instance
const router = createRouter({
  routeTree,
  routeMasks: [photoModalToPhotoMask],
  defaultPreload: 'intent',
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(<RouterProvider router={router} />)
}
