import { LoaderClient } from '@tanstack/solid-loaders'
import { invoicesLoader } from './routes/dashboard'
import { invoiceLoader } from './routes/dashboard/invoices/invoice'
import { usersLoader } from './routes/dashboard/users'
import { userLoader } from './routes/dashboard/users/user'
import { randomIdLoader } from './routes/layout'

export const loaderClient = new LoaderClient({
  getLoaders: () => [
    invoicesLoader,
    invoiceLoader,
    usersLoader,
    userLoader,
    randomIdLoader,
  ],
})

declare module '@tanstack/solid-loaders' {
  interface Register {
    loaderClient: typeof loaderClient
  }
}
