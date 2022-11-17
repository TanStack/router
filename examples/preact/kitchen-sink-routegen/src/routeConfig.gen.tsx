import { createRouteConfig } from '@tanstack/react-router'

import index from './routes/index'
import authenticated from './routes/authenticated'
import dashboard from './routes/dashboard'
import dashboardindex from './routes/dashboard/index'
import dashboardinvoices from './routes/dashboard/invoices'
import dashboardinvoicesindex from './routes/dashboard/invoices/index'
import dashboardinvoicesinvoice from './routes/dashboard/invoices/invoice'
import dashboardusers from './routes/dashboard/users'
import dashboardusersindex from './routes/dashboard/users/index'
import dashboardusersuser from './routes/dashboard/users/user'
import expensive from './routes/expensive'
import layout from './routes/layout'
import layoutlayouta from './routes/layout/layout-a'
import layoutlayoutb from './routes/layout/layout-b'

export const routeConfig = createRouteConfig().addChildren([
  index,
  authenticated,
  dashboard.addChildren([
    dashboardindex,
    dashboardinvoices.addChildren([
        dashboardinvoicesindex,
      dashboardinvoicesinvoice
    ]),
    dashboardusers.addChildren([
        dashboardusersindex,
      dashboardusersuser
    ])
  ]),
  expensive,
  layout.addChildren([
    layoutlayouta,
    layoutlayoutb
  ])
])