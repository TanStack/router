import { LoaderClient } from '@tanstack/react-loaders'
import { invoicesLoader } from './routes/dashboard'
import { invoiceLoader } from './routes/dashboard/invoices/invoice'
import { usersLoader } from './routes/dashboard/users'
import { userLoader } from './routes/dashboard/users/user'
import { randomIdLoader } from './routes/layout'

export const loaderClient = new LoaderClient({
  loaders: [
    invoicesLoader,
    invoiceLoader,
    usersLoader,
    userLoader,
    randomIdLoader,
  ],
})

declare module '@tanstack/react-loaders' {
  interface RegisterLoaderClient {
    loaderClient: typeof loaderClient
  }
}
