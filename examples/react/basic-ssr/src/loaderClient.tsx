import { LoaderClient } from '@tanstack/react-loaders'

const invoicesLoader = new Loader({
  key: 'invoices',
  loader: async () => {
    console.log('Fetching invoices...')
    return fetchInvoices()
  },
})

const invoiceLoader = new Loader({
  key: 'invoice',
  loader: async (invoiceId: number) => {
    console.log(`Fetching invoice with id ${invoiceId}...`)
    return fetchInvoiceById(invoiceId)
  },
  onAllInvalidate: async () => {
    await invoicesLoader.invalidateAll()
  },
})

const usersLoader = new Loader({
  key: 'users',
  loader: async () => {
    console.log('Fetching users...')
    return fetchUsers()
  },
})

const userLoader = new Loader({
  key: 'user',
  loader: async (userId: number) => {
    console.log(`Fetching user with id ${userId}...`)
    return fetchUserById(userId)
  },
  onAllInvalidate: async () => {
    await usersLoader.invalidateAll()
  },
})

const randomIdLoader = new Loader({
  key: 'random',
  loader: () => {
    return fetchRandomNumber()
  },
})

export const createLoaderClient = () => {
  return new LoaderClient({
    getLoaders: () => [
      invoicesLoader,
      invoiceLoader,
      usersLoader,
      userLoader,
      randomIdLoader,
    ],
  })
}

// Register things for typesafety
declare module '@tanstack/react-loaders' {
  interface Register {
    loaderClient: ReturnType<typeof createLoaderClient>
  }
}
