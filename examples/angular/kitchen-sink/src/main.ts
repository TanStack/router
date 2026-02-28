import {
  Component,
  computed,
  effect,
  EnvironmentInjector,
  inject,
  Injector,
  input,
  linkedSignal,
  ProviderToken,
  signal,
} from '@angular/core'
import './router-register'
import { bootstrapApplication } from '@angular/platform-browser'
import {
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  injectRouter,
  injectRouterState,
  Link,
  LinkOptions,
  notFound,
  redirect,
  retainSearchParams,
  RouterContextOptions,
} from '@tanstack/angular-router'
import { TanStackRouterDevtoolsInProd } from '@tanstack/angular-router-devtools'
import { z } from 'zod'
import { injectMutation } from './injectMutation'
import './styles.css'
import { JsonPipe } from '@angular/common'
import { UsersService, InvoiceService, Invoice } from './services'

@Component({
  selector: 'app-spinner',
  standalone: true,
  template: `
    <div
      [class]="
        'inline-block animate-spin px-3 transition ' +
        (show()
          ? 'opacity-1 duration-500 ' + (wait() ?? 'delay-300')
          : 'duration-500 opacity-0 delay-0')
      "
    >
      ⍥
    </div>
  `,
})
class SpinnerComponent {
  show = input(true)
  wait = input<`delay-${number}` | undefined>(undefined)
}

@Component({
  selector: 'app-invoice-fields',
  standalone: true,
  styles: `
    :host {
      display: block;
    }
  `,
  template: `
    <div class="space-y-2">
      <h2 class="font-bold text-lg">
        <input
          name="title"
          [value]="invoice().title"
          placeholder="Invoice Title"
          class="border border-opacity-50 rounded-sm p-2 w-full"
          [disabled]="disabled()"
        />
      </h2>
      <div>
        <textarea
          name="body"
          [value]="invoice().body"
          rows="6"
          placeholder="Invoice Body..."
          class="border border-opacity-50 p-2 rounded-sm w-full"
          [disabled]="disabled()"
        ></textarea>
      </div>
    </div>
  `,
})
class InvoiceFieldsComponent {
  invoice = input.required<Invoice>()
  disabled = input(false)
}

type UsersViewSortBy = 'name' | 'id' | 'email'

type MissingUserData = {
  userId: number
}

function isMissingUserData(data: unknown): data is MissingUserData {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { userId?: unknown }).userId === 'number'
  )
}

@Component({
  selector: 'app-users-not-found',
  standalone: true,
  template: `
    <div class="p-4 space-y-2">
      <h4 class="text-lg font-bold">User not found</h4>
      <p>
        @if (userId() !== undefined) {
          We couldn't find a user with ID {{ userId() }}.
        } @else {
          We couldn't find the requested user.
        }
      </p>
      <p class="text-xs text-gray-500">Rendered by the "{{ routeId() }}" route.</p>
      <p class="text-sm text-gray-500">Pick another user from the list on the left to continue.</p>
    </div>
  `,
})
class UsersNotFoundComponent {
  data = signal<any>(null)
  routeId = signal<string>('')

  userId = computed(() => {
    const d = this.data()
    return isMissingUserData(d) ? d.userId : undefined
  })
}

const rootRoute = createRootRouteWithContext<{
  auth: Auth
  inject: Injector['get']
}>()({
  component: () => RootComponent,
  errorComponent: () => ErrorComponent,
})

@Component({
  selector: 'app-router-spinner',
  standalone: true,
  imports: [SpinnerComponent],
  template: `<app-spinner [show]="isLoading()" />`,
})
class RouterSpinnerComponent {
  isLoading = injectRouterState({ select: (s) => s.status === 'pending' })
}

@Component({
  selector: 'app-top-loading-bar',
  standalone: true,
  styles: `
    @keyframes top-loader-indeterminate {
      0% {
        transform: translateX(-110%);
      }
      100% {
        transform: translateX(260%);
      }
    }

    .top-loader-indeterminate {
      animation: top-loader-indeterminate 1.1s linear infinite;
    }
  `,
  template: `
    <div
      class="pointer-events-none absolute left-0 top-0 z-50 h-1 w-full overflow-hidden transition-opacity duration-200"
      [class.opacity-0]="!isLoading()"
      [class.opacity-100]="isLoading()"
    >
      <div class="top-loader-indeterminate h-full w-2/5 bg-blue-500"></div>
    </div>
  `,
})
class TopLoadingBarComponent {
  isLoading = injectRouterState({ select: (s) => s.status === 'pending' })
}

@Component({
  selector: 'app-breadcrumbs',
  standalone: true,
  imports: [Link],
  template: `
    @if (matchesWithCrumbs().length > 0) {
      <nav>
        <ul class="flex gap-2 items-center">
          @for (match of matchesWithCrumbs(); track match.id) {
            <li class="flex gap-2">
              <a [link]="{ to: match.pathname }" class="text-blue-700">
                {{ match.loaderData.crumb }}
              </a>
              @if (!$last) {
                <span>></span>
              }
            </li>
          }
        </ul>
      </nav>
    }
  `,
})
class BreadcrumbsComponent {
  routerState = injectRouterState()

  matchesWithCrumbs = computed(() => {
    const state = this.routerState()
    const matches = state.matches

    // Filter out pending matches
    if (matches.some((match) => match.status === 'pending')) {
      return []
    }

    // Filter matches that have loaderData.crumb
    return matches.filter((match) => {
      return match.loaderData && typeof match.loaderData === 'object' && 'crumb' in match.loaderData
    }) as Array<{ id: string; pathname: string; loaderData: { crumb: string } }>
  })
}

@Component({
  selector: 'app-root-layout',
  standalone: true,
  imports: [
    Outlet,
    Link,
    TopLoadingBarComponent,
    RouterSpinnerComponent,
    TanStackRouterDevtoolsInProd,
    BreadcrumbsComponent,
  ],
  template: `
    <div class="relative min-h-screen flex flex-col">
      <app-top-loading-bar />
      <div class="flex items-center border-b gap-2">
        <h1 class="text-3xl p-2">Kitchen Sink</h1>
        <app-breadcrumbs />
        <div class="text-3xl">
          <app-router-spinner />
        </div>
      </div>
      <div class="flex-1 flex">
        <div class="divide-y w-56">
          @for (link of links(); track link[0]) {
            <div>
              <a
                [link]="{ to: link[0] }"
                [class]="'block py-2 px-3 text-blue-700'"
                [class.font-bold]="isActive(link[0])"
                preload="intent"
              >
                {{ link[1] }}
              </a>
            </div>
          }
        </div>
        <div class="flex-1 border-l">
          <outlet />
        </div>
      </div>
    </div>
    <router-devtools position="bottom-right" />
  `,
})
class RootComponent {
  authSignal = signal(auth)
  routerState = injectRouterState()

  links = computed(() => {
    const currentAuth = this.authSignal()
    const baseLinks: Array<[string, string]> = [
      ['/', 'Home'],
      ['/dashboard', 'Dashboard'],
      ['/expensive', 'Expensive'],
      ['/route-a', 'Pathless Layout A'],
      ['/route-b', 'Pathless Layout B'],
      ['/profile', 'Profile'],
    ]
    if (currentAuth.status === 'loggedOut') {
      return [...baseLinks, ['/login', 'Login']]
    }
    return baseLinks
  })

  isActive(path: string): boolean {
    const currentPath = this.routerState().location.pathname
    return currentPath === path || currentPath.startsWith(path + '/')
  }
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => IndexComponent,
})

@Component({
  selector: 'app-index',
  standalone: true,
  imports: [Link],
  template: `
    <div class="p-2">
      <div class="text-lg">Welcome Home!</div>
      <hr class="my-2" />
      <a
        [link]="{ to: '/dashboard/invoices/$invoiceId', params: { invoiceId: 3 } }"
        class="py-1 px-2 text-xs bg-blue-500 text-white rounded-full"
      >
        1 New Invoice
      </a>
      <hr class="my-2" />
      <div class="max-w-xl">
        As you navigate around take note of the UX. It should feel suspense-like, where routes are
        only rendered once all of their data and elements are ready.
        <hr class="my-2" />
        To exaggerate async effects, play with the artificial request delay slider in the
        bottom-left corner.
        <hr class="my-2" />
        The last 2 sliders determine if link-hover preloading is enabled (and how long those
        preloads stick around) and also whether to cache rendered route data (and for how long).
        Both of these default to 0 (or off).
      </div>
    </div>
  `,
})
class IndexComponent {
  invoiceRoute = invoiceRoute
}

const dashboardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'dashboard',
  loader: () => ({ crumb: 'Dashboard' }),
  component: () => DashboardLayoutComponent,
})

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [Outlet, Link],
  template: `
    <div class="flex items-center border-b">
      <h2 class="text-xl p-2">Dashboard</h2>
    </div>
    <div class="flex flex-wrap divide-x">
      @for (link of links; track link[0]) {
        <a
          [link]="{ to: link[0] }"
          [class]="'p-2'"
          [class.font-bold]="isActive(link[0], link[2])"
        >
          {{ link[1] }}
        </a>
      }
    </div>
    <hr />
    <outlet />
  `,
})
class DashboardLayoutComponent {
  routerState = injectRouterState()
  links: Array<[string, string, boolean?]> = [
    ['/dashboard', 'Summary', true],
    ['/dashboard/invoices', 'Invoices'],
    ['/dashboard/users', 'Users'],
  ]

  isActive(path: string, exact?: boolean): boolean {
    const currentPath = this.routerState().location.pathname
    if (exact) {
      return currentPath === path
    }
    return currentPath === path || currentPath.startsWith(path + '/')
  }
}

const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/',
  loader: ({ context }) => {
    const invoiceService = context.inject(InvoiceService)
    return invoiceService.fetchInvoices()
  },
  component: () => DashboardIndexComponent,
})

@Component({
  selector: 'app-dashboard-index',
  standalone: true,
  template: `
    <div class="p-2">
      <div class="p-2">
        Welcome to the dashboard! You have
        <strong>{{ invoices().length }} total invoices</strong>.
      </div>
    </div>
  `,
})
class DashboardIndexComponent {
  invoices = dashboardIndexRoute.injectLoaderData()
}

const invoicesLayoutRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: 'invoices',
  loader: ({ context }) => {
    const invoiceService = context.inject(InvoiceService)
    return invoiceService.fetchInvoices()
  },
  component: () => InvoicesLayoutComponent,
})

@Component({
  selector: 'app-invoices-layout',
  standalone: true,
  imports: [Outlet, Link, SpinnerComponent],
  preserveWhitespaces: false,
  template: `
    <div class="flex-1 flex">
      <div class="divide-y w-48">
        @for (invoice of invoices(); track invoice.id) {
          <div>
            <a
              [link]="{
                to: '/dashboard/invoices/$invoiceId',
                params: { invoiceId: invoice.id },
              }"
              class="block py-2 px-3 text-blue-700 leading-none"
              [class.font-bold]="isActive('/dashboard/invoices/' + invoice.id)"
              preload="intent"
            >
              <span class="text-sm font-mono">
                #{{ invoice.id }} - {{ invoice.title.slice(0, 10) }}
                @if (isPending(invoice.id)) {
                  <app-spinner [show]="true" wait="delay-50" />
                }
              </span>
            </a>
          </div>
        }
      </div>
      <div class="flex-1 border-l">
        <outlet />
      </div>
    </div>
  `,
})
class InvoicesLayoutComponent {
  invoices = invoicesLayoutRoute.injectLoaderData()
  routerState = injectRouterState()

  isActive(path: string): boolean {
    return (
      this.routerState().location.pathname === path ||
      this.routerState().location.pathname.startsWith(path + '/')
    )
  }

  isPending(invoiceId: number): boolean {
    const matches = this.routerState().matches
    const match = matches.find(
      (m) => m.routeId === invoiceRoute.id && m.params?.invoiceId === invoiceId,
    )
    return match?.status === 'pending' || false
  }
}

const invoicesIndexRoute = createRoute({
  getParentRoute: () => invoicesLayoutRoute,
  path: '/',
  component: () => InvoicesIndexComponent,
})

@Component({
  selector: 'app-invoices-index',
  standalone: true,
  imports: [InvoiceFieldsComponent, SpinnerComponent],
  template: `
    <div class="p-2">
      <form (submit)="onSubmit($event)" class="space-y-2">
        <div>Create a new Invoice:</div>
        <app-invoice-fields [invoice]="emptyInvoice" />
        <div>
          <button
            type="submit"
            class="bg-blue-500 rounded-sm p-2 uppercase text-white font-black disabled:opacity-50"
            [disabled]="createInvoiceMutation.status() === 'pending'"
          >
            @if (createInvoiceMutation.status() === 'pending') {
              Creating <app-spinner />
            } @else {
              Create
            }
          </button>
        </div>
        @if (createInvoiceMutation.status() === 'success') {
          <div
            class="inline-block px-2 py-1 rounded-sm bg-green-500 text-white animate-bounce"
            style="animation-iteration-count: 2.5; animation-duration: 0.3s"
          >
            Created!
          </div>
        } @else if (createInvoiceMutation.status() === 'error') {
          <div
            class="inline-block px-2 py-1 rounded-sm bg-red-500 text-white animate-bounce"
            style="animation-iteration-count: 2.5; animation-duration: 0.3s"
          >
            Failed to create.
          </div>
        }
      </form>
    </div>
  `,
})
class InvoicesIndexComponent {
  router = injectRouter()
  routerContext = invoicesIndexRoute.injectRouteContext()

  createInvoiceMutation = injectMutation({
    fn: (variables: Partial<Invoice>) => {
      const context = this.routerContext()
      const invoiceService = context.inject(InvoiceService)
      return invoiceService.postInvoice(variables)
    },
    onSuccess: () => this.router.invalidate(),
  })

  emptyInvoice = {
    body: '',
    title: '',
  } as Invoice

  onSubmit(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    const form = event.target as HTMLFormElement
    const formData = new FormData(form)
    this.createInvoiceMutation.mutate({
      title: formData.get('title') as string,
      body: formData.get('body') as string,
    })
  }
}

const invoiceRoute = createRoute({
  getParentRoute: () => invoicesLayoutRoute,
  path: '$invoiceId',
  params: {
    parse: (params) => ({
      invoiceId: z.number().int().parse(Number(params.invoiceId)),
    }),
    stringify: ({ invoiceId }) => ({ invoiceId: `${invoiceId}` }),
  },
  validateSearch: (search) =>
    z
      .object({
        showNotes: z.boolean().optional(),
        notes: z.string().optional(),
      })
      .parse(search),
  loader: async ({ params: { invoiceId }, context }) => {
    const invoiceService = context.inject(InvoiceService)
    const invoice = await invoiceService.fetchInvoiceById(invoiceId)
    if (!invoice) throw notFound()
    return invoice
  },
  component: () => InvoiceComponent,
  pendingComponent: () => SpinnerComponent,
})

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [Link, InvoiceFieldsComponent],
  template: `
    <form (submit)="onSubmit($event)" class="p-2 space-y-2">
      <app-invoice-fields
        [invoice]="invoice()"
        [disabled]="updateInvoiceMutation.status() === 'pending'"
      />
      <div>
        <a [link]="toggleSearchNotesLinkOptions()" class="text-blue-700">
          {{ search().showNotes ? 'Close Notes' : 'Show Notes' }}
        </a>
        @if (search().showNotes) {
          <div>
            <div class="h-2"></div>
            <textarea
              [value]="notes()"
              (input)="notes.set($any($event.target).value)"
              rows="5"
              class="shadow-sm w-full p-2 rounded-sm"
              placeholder="Write some notes here..."
            ></textarea>
            <div class="italic text-xs">
              Notes are stored in the URL. Try copying the URL into a new tab!
            </div>
          </div>
        }
      </div>
      <div>
        <button
          type="submit"
          class="bg-blue-500 rounded-sm p-2 uppercase text-white font-black disabled:opacity-50"
          [disabled]="updateInvoiceMutation.status() === 'pending'"
        >
          Save
        </button>
      </div>
      @if (
        updateInvoiceMutation.variables()?.id === invoice().id &&
        updateInvoiceMutation.submittedAt()
      ) {
        <div>
          @if (updateInvoiceMutation.status() === 'success') {
            <div
              class="inline-block px-2 py-1 rounded-sm bg-green-500 text-white animate-bounce"
              style="animation-iteration-count: 2.5; animation-duration: 0.3s"
            >
              Saved!
            </div>
          } @else if (updateInvoiceMutation.status() === 'error') {
            <div
              class="inline-block px-2 py-1 rounded-sm bg-red-500 text-white animate-bounce"
              style="animation-iteration-count: 2.5; animation-duration: 0.3s"
            >
              Failed to save.
            </div>
          }
        </div>
      }
    </form>
  `,
})
class InvoiceComponent {
  router = injectRouter()
  search = invoiceRoute.injectSearch()
  navigate = invoiceRoute.injectNavigate()
  invoice = invoiceRoute.injectLoaderData()
  routerContext = invoiceRoute.injectRouteContext()
  updateInvoiceMutation = injectMutation({
    fn: (variables: Partial<Invoice>) => {
      const context = this.routerContext()
      const invoiceService = context.inject(InvoiceService)
      return invoiceService.patchInvoice(this.invoice().id, variables)
    },
    onSuccess: () => this.router.invalidate(),
  })
  notes = signal(this.search().notes ?? '')

  #updateNotes = effect(() => {
    const currentNotes = this.notes()
    this.navigate({
      search: (old) => ({
        ...old,
        notes: currentNotes ? currentNotes : undefined,
      }),
      params: true,
      replace: true,
    })
  })

  onSubmit(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    const form = event.target as HTMLFormElement
    const formData = new FormData(form)
    this.updateInvoiceMutation.mutate({
      id: this.invoice().id,
      title: formData.get('title') as string,
      body: formData.get('body') as string,
    })
  }

  toggleSearchNotesLinkOptions() {
    return {
      to: '/dashboard/invoices/$invoiceId',
      params: { invoiceId: this.invoice().id },
      search: (old) => ({
        ...old,
        showNotes: old.showNotes ? undefined : true,
      }),
    } as LinkOptions
  }
}

const usersLayoutRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: 'users',
  validateSearch: z.object({
    usersView: z
      .object({
        sortBy: z.enum(['name', 'id', 'email']).optional(),
        filterBy: z.string().optional(),
      })
      .optional(),
  }).parse,
  search: {
    middlewares: [retainSearchParams(['usersView'])],
  },
  loaderDeps: ({ search: { usersView } }) => ({
    filterBy: usersView?.filterBy,
    sortBy: usersView?.sortBy ?? 'name',
  }),
  loader: async ({ deps, context }) => {
    const usersService = context.inject(UsersService)
    const users = await usersService.fetchUsers(deps)
    return { users, crumb: 'Users' }
  },
  notFoundComponent: () => UsersNotFoundComponent,
  component: () => UsersLayoutComponent,
})

@Component({
  selector: 'app-users-layout',
  standalone: true,
  imports: [Outlet, Link, SpinnerComponent],
  template: `
    <div class="flex-1 flex">
      <div class="divide-y">
        <div class="py-2 px-3 flex gap-2 items-center bg-gray-100 dark:bg-gray-800">
          <div>Sort By:</div>
          <select
            [value]="sortBy()"
            (change)="setSortBy($any($event.target).value)"
            class="flex-1 border p-1 px-2 rounded-sm"
          >
            @for (option of sortOptions; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        </div>
        <div class="py-2 px-3 flex gap-2 items-center bg-gray-100 dark:bg-gray-800">
          <div>Filter By:</div>
          <input
            [value]="filterDraft()"
            (input)="filterDraft.set($any($event.target).value)"
            placeholder="Search Names..."
            class="min-w-0 flex-1 border p-1 px-2 rounded-sm"
          />
        </div>
        @for (user of filteredUsers(); track user.id) {
          <div>
            <a
              [link]="{
                to: '/dashboard/users/user',
                search: { userId: user.id },
              }"
              class="block py-2 px-3 text-blue-700 leading-none"
              [class.font-bold]="isActive('/dashboard/users/user', user.id)"
            >
              <span class="text-sm font-mono">
                {{ user.name }}
                @if (isPending(user.id)) {
                  <app-spinner [show]="true" [wait]="'delay-50'" />
                }
              </span>
            </a>
          </div>
        }
        <div class="px-3 py-2 text-xs text-gray-500 bg-gray-100 dark:bg-gray-800/60">
          Need to see how not-found errors look?
          <a
            [link]="{
              to: '/dashboard/users/user',
              search: { userId: 404 },
            }"
            class="text-blue-700"
          >
            Try loading user 404
          </a>
        </div>
      </div>
      <div class="flex-initial border-l">
        <outlet />
      </div>
    </div>
  `,
})
class UsersLayoutComponent {
  navigate = usersLayoutRoute.injectNavigate()
  searchSignal = usersLayoutRoute.injectSearch()
  loaderData = usersLayoutRoute.injectLoaderData()
  users = computed(() => this.loaderData().users)
  routerState = injectRouterState()
  sortOptions = ['name', 'id', 'email']

  search = computed(() => this.searchSignal())
  sortBy = computed(() => this.search().usersView?.sortBy ?? 'name')
  filterBy = computed(() => this.search().usersView?.filterBy)
  filterDraft = linkedSignal(() => this.filterBy() ?? '')

  #updateFilter = effect(() => {
    const draft = this.filterDraft()
    this.navigate({
      search: (old) => ({
        ...old,
        usersView: {
          ...old.usersView,
          filterBy: draft || undefined,
        },
      }),
      replace: true,
    })
  })

  sortedUsers = computed(() => {
    const usersList = this.users()
    if (!usersList) return []
    const sort = this.sortBy()
    if (!sort) return usersList
    return [...usersList].sort((a, b) => {
      return a[sort] > b[sort] ? 1 : -1
    })
  })

  filteredUsers = computed(() => {
    const sorted = this.sortedUsers()
    const filter = this.filterBy()
    if (!filter) return sorted
    return sorted.filter((user) => user.name.toLowerCase().includes(filter.toLowerCase()))
  })

  setSortBy(sortBy: UsersViewSortBy) {
    this.navigate({
      search: (old) => ({
        ...old,
        usersView: {
          ...(old.usersView ?? {}),
          sortBy,
        },
      }),
      replace: true,
    })
  }

  isActive(path: string, userId?: number): boolean {
    const currentPath = this.routerState().location.pathname
    const currentSearch = this.search()
    if (userId !== undefined) {
      return currentPath === path && (currentSearch as { userId?: number }).userId === userId
    }
    return currentPath === path || currentPath.startsWith(path + '/')
  }

  isPending(userId: number): boolean {
    const matches = this.routerState().matches
    const match = matches.find(
      (m) =>
        m.routeId === userRoute.id &&
        m.search &&
        (m.search as { userId?: number }).userId === userId,
    )
    return match?.status === 'pending' || false
  }
}

const usersIndexRoute = createRoute({
  getParentRoute: () => usersLayoutRoute,
  path: '/',
  component: () => UsersIndexComponent,
})

@Component({
  selector: 'app-users-index',
  standalone: true,
  template: `
    <div class="p-2 space-y-2">
      <p>
        Normally, setting default search parameters would either need to be done manually in every
        link to a page, or as a side-effect (not a great experience).
      </p>
      <p>
        Instead, we can use <strong>search filters</strong> to provide defaults or even persist
        search params for links to routes (and child routes).
      </p>
      <p>
        A good example of this is the sorting and filtering of the users list. In a traditional
        router, both would be lost while navigating around individual users or even changing each
        sort/filter option unless each state was manually passed from the current route into each
        new link we created (that's a lot of tedious and error-prone work). With TanStack router and
        search filters, they are persisted with little effort.
      </p>
    </div>
  `,
})
class UsersIndexComponent { }

const userRoute = createRoute({
  getParentRoute: () => usersLayoutRoute,
  path: 'user',
  validateSearch: z.object({
    userId: z.number(),
  }),
  loaderDeps: ({ search: { userId } }) => ({
    userId,
  }),
  loader: async ({ deps: { userId }, context }) => {
    const usersService = context.inject(UsersService)
    const user = await usersService.fetchUserById(userId)

    if (!user) {
      throw notFound({
        data: {
          userId,
        },
      })
    }

    return { user, crumb: user.name }
  },
  component: () => UserComponent,
})

@Component({
  selector: 'app-user',
  standalone: true,
  template: `
    <h4 class="p-2 font-bold">{{ user().name }}</h4>
    <pre class="text-sm whitespace-pre-wrap">{{ userJson() }}</pre>
  `,
})
class UserComponent {
  loaderData = userRoute.injectLoaderData()
  user = computed(() => this.loaderData().user)
  userJson = computed(() => JSON.stringify(this.user(), null, 2))
}

const expensiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'expensive',
}).lazy(() => import('./expensive.route').then((d) => d.Route))

const authPathlessLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  beforeLoad: ({ context, location }) => {
    if (context.auth.status === 'loggedOut') {
      console.log(location)
      throw redirect({
        to: loginRoute.to,
        search: {
          redirect: location.href,
        },
      })
    }

    return {
      username: auth.username,
    }
  },
})

const profileRoute = createRoute({
  getParentRoute: () => authPathlessLayoutRoute,
  path: 'profile',
  component: () => ProfileComponent,
})

@Component({
  selector: 'app-profile',
  standalone: true,
  template: `
    <div class="p-2 space-y-2">
      <div>
        Username:<strong>{{ username() }}</strong>
      </div>
      <button
        (click)="logout()"
        class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded-sm"
      >
        Log out
      </button>
    </div>
  `,
})
class ProfileComponent {
  router = injectRouter()
  routeContext = profileRoute.injectRouteContext()
  username = computed(() => this.routeContext().username)

  logout() {
    auth.logout()
    this.router.invalidate()
  }
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  loaderDeps: ({ search: { redirect } }) => ({ redirect }),
  loader: ({ context, deps }) => {
    // This is not done in the other examples, but since in angular
    // we don't have transitions, this loader can prevent double renders
    // by doing an early redirect.
    if (context.auth.status === 'loggedIn' && deps.redirect) {
      throw redirect({ to: deps.redirect })
    }
  },
}).update({
  component: () => LoginComponent,
})

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    @if (status() === 'loggedIn') {
      <div>
        Logged in as <strong>{{ auth().username }}</strong>
        <div class="h-2"></div>
        <button
          (click)="logout()"
          class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded-sm"
        >
          Log out
        </button>
        <div class="h-2"></div>
      </div>
    } @else {
      <div class="p-2">
        <div>You must log in!</div>
        <div class="h-2"></div>
        <form (submit)="onSubmit($event)" class="flex gap-2">
          <input
            [value]="username()"
            (input)="username.set($any($event.target).value)"
            placeholder="Username"
            class="border p-1 px-2 rounded-sm"
          />
          <button
            type="submit"
            class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded-sm"
          >
            Login
          </button>
        </form>
      </div>
    }
  `,
})
class LoginComponent {
  router = injectRouter()
  routeContext = loginRoute.injectRouteContext({
    select: ({ auth }) => ({ auth, status: auth.status }),
  })
  search = loginRoute.injectSearch()
  username = signal('')

  auth = computed(() => this.routeContext().auth)
  status = computed(() => this.routeContext().status)

  #redirectIfLoggedIn = effect(() => {
    if (this.status() === 'loggedIn' && this.search().redirect) {
      this.router.history.push(this.search().redirect!)
    }
  })

  onSubmit(event: Event) {
    event.preventDefault()
    this.auth().login(this.username())
    this.router.invalidate()
  }

  logout() {
    this.auth().logout()
    this.router.invalidate()
  }
}

const pathlessLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'pathless-layout',
  component: () => PathlessLayoutComponent,
})

@Component({
  selector: 'app-pathless-layout',
  standalone: true,
  imports: [Outlet],
  template: `
    <div>
      <div>Pathless Layout</div>
      <hr />
      <outlet />
    </div>
  `,
})
class PathlessLayoutComponent { }

const pathlessLayoutARoute = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  path: 'route-a',
  component: () => PathlessLayoutAComponent,
})

@Component({
  selector: 'app-pathless-layout-a',
  standalone: true,
  template: `
    <div>
      <div>I'm A</div>
    </div>
  `,
})
class PathlessLayoutAComponent { }

const pathlessLayoutBRoute = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  path: 'route-b',
  component: () => PathlessLayoutBComponent,
})

@Component({
  selector: 'app-pathless-layout-b',
  standalone: true,
  template: `
    <div>
      <div>I'm B</div>
    </div>
  `,
})
class PathlessLayoutBComponent { }

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardLayoutRoute.addChildren([
    dashboardIndexRoute,
    invoicesLayoutRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
    usersLayoutRoute.addChildren([usersIndexRoute, userRoute]),
  ]),
  expensiveRoute,
  authPathlessLayoutRoute.addChildren([profileRoute]),
  loginRoute,
  pathlessLayoutRoute.addChildren([pathlessLayoutARoute, pathlessLayoutBRoute]),
])

export const router = createRouter({
  routeTree,
  defaultPendingComponent: () => SpinnerComponent,
  // defaultErrorComponent: () => ErrorComponent,
  context: {
    auth: undefined!,
    inject: undefined!,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

const auth: Auth = {
  status: 'loggedOut',
  username: undefined,
  login: (username: string) => {
    auth.username = username
    auth.status = 'loggedIn'
  },
  logout: () => {
    auth.status = 'loggedOut'
    auth.username = undefined
  },
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterProvider],
  template: `
    <router-provider [router]="router" [context]="routerContext" />
    <div
      class="text-xs fixed w-52 shadow-md shadow-black/20 rounded-sm bottom-2 left-2 bg-white dark:bg-gray-800 bg-opacity-75 border-b flex flex-col gap-1 flex-wrap items-left divide-y"
    >
      <div class="p-2 space-y-2">
        <div class="flex gap-2">
          <button (click)="setLoaderDelay(150)" class="bg-blue-500 text-white rounded-sm p-1 px-2">
            Fast
          </button>
          <button (click)="setLoaderDelay(500)" class="bg-blue-500 text-white rounded-sm p-1 px-2">
            Fast 3G
          </button>
          <button (click)="setLoaderDelay(2000)" class="bg-blue-500 text-white rounded-sm p-1 px-2">
            Slow 3G
          </button>
        </div>
        <div>
          <div>Loader Delay: {{ loaderDelay() }}ms</div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            [value]="loaderDelay()"
            (input)="setLoaderDelay($any($event.target).valueAsNumber)"
            class="w-full"
          />
        </div>
      </div>
      <div class="p-2 space-y-2">
        <div class="flex gap-2">
          <button (click)="resetPending()" class="bg-blue-500 text-white rounded-sm p-1 px-2">
            Reset to Default
          </button>
        </div>
        <div>
          <div>defaultPendingMs: {{ pendingMs() }}ms</div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            [value]="pendingMs()"
            (input)="setPendingMs($any($event.target).valueAsNumber)"
            class="w-full"
          />
        </div>
        <div>
          <div>defaultPendingMinMs: {{ pendingMinMs() }}ms</div>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            [value]="pendingMinMs()"
            (input)="setPendingMinMs($any($event.target).valueAsNumber)"
            class="w-full"
          />
        </div>
      </div>
    </div>
  `,
})
class AppComponent {
  router = router
  environmentInjector = inject(EnvironmentInjector)

  routerContext: RouterContextOptions<typeof routeTree>['context'] = {
    auth,
    inject: (token: ProviderToken<any>) => this.environmentInjector.get(token),
  }

  loaderDelay = useSessionStorage('loaderDelay', 500)
  pendingMs = useSessionStorage('pendingMs', 1000)
  pendingMinMs = useSessionStorage('pendingMinMs', 500)

  setLoaderDelay(value: number) {
    this.loaderDelay.set(value)
  }

  setPendingMs(value: number) {
    this.pendingMs.set(value)
  }

  setPendingMinMs(value: number) {
    this.pendingMinMs.set(value)
  }

  resetPending() {
    this.pendingMs.set(1000)
    this.pendingMinMs.set(500)
  }
}

type Auth = {
  login: (username: string) => void
  logout: () => void
  status: 'loggedOut' | 'loggedIn'
  username?: string
}

@Component({
  selector: 'app-error',
  standalone: true,
  imports: [JsonPipe],
  template: `
    <div class="p-2">
      <h2>Error</h2>
      <pre>{{ error() | json }}</pre>
      <button (click)="reset()">Reset</button>
    </div>
  `,
})
class ErrorComponent {
  error = signal<any>(null)
  router = injectRouter()

  reset() {
    this.router.invalidate()
  }
}

function useSessionStorage<T>(key: string, initialValue: T) {
  const stored = sessionStorage.getItem(key)
  const value = signal<T>(stored ? JSON.parse(stored) : initialValue)

  effect(() => {
    sessionStorage.setItem(key, JSON.stringify(value()))
  })

  return value
}

bootstrapApplication(AppComponent).catch((err) => console.error(err))
