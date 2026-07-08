import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

const FEATURES = [
  {
    title: 'Session validation',
    description:
      'Descope sessions validated on the server on every request, during SSR and client navigation.',
    href: 'https://docs.descope.com/session-management/session-validation',
    icon: <ServerIcon />,
  },
  {
    title: 'React SDK',
    description:
      'Protected routes, hooks, and auth state from @descope/react-sdk.',
    href: 'https://docs.descope.com/getting-started/react',
    icon: <RoutesIcon />,
  },
  {
    title: 'Flows & widgets',
    description:
      'The hosted sign-up-or-in flow and the self-service user profile widget.',
    href: 'https://docs.descope.com/widgets',
    icon: <WidgetsIcon />,
  },
]

function Home() {
  const { user } = Route.useRouteContext()

  return (
    <div className="relative overflow-hidden">
      {/* background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/4 h-[28rem] w-[28rem] rounded-full bg-blue-600/15 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 lg:grid-cols-2 lg:py-28">
        {/* left column */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/60 px-4 py-1.5 text-sm text-gray-300">
            <span className="size-1.5 rounded-full bg-teal-400" />
            Example integration
          </span>

          <h1 className="mt-6 text-5xl font-bold tracking-tight text-white sm:text-6xl">
            TanStack Start <span className="text-teal-400">+</span> Descope
          </h1>

          <p className="mt-6 max-w-md text-lg text-gray-400">
            Server-validated sessions, protected routes, and Descope&apos;s
            hosted login flow &amp; user profile widget — in one small example.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            {user ? (
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400"
              >
                View your profile
                <ArrowRightIcon />
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400"
              >
                Sign in to get started
                <ArrowRightIcon />
              </Link>
            )}
            <a
              href="https://docs.descope.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-6 py-3 font-semibold text-gray-200 transition hover:bg-gray-900"
            >
              <BookIcon />
              View docs
            </a>
          </div>

          {user ? (
            <p className="mt-6 text-sm text-gray-500">
              Signed in as{' '}
              <span className="font-semibold text-gray-300">
                {user.email ?? user.userId}
              </span>
            </p>
          ) : (
            <p className="mt-6 text-sm text-gray-500">
              New to Descope?{' '}
              <a
                href="https://www.descope.com/sign-up"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-teal-400 hover:text-teal-300"
              >
                Create a free account →
              </a>
            </p>
          )}
        </div>

        {/* right column — feature cards, each linking to its docs */}
        <div className="flex flex-col gap-6">
          {FEATURES.map((feature) => (
            <a
              key={feature.title}
              href={feature.href}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-5 rounded-2xl border border-gray-800 bg-gray-900/50 p-6 transition hover:border-gray-700 hover:bg-gray-900"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                {feature.icon}
              </div>
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  {feature.title}
                  <span className="text-gray-600 opacity-0 transition group-hover:opacity-100">
                    <ArrowRightIcon />
                  </span>
                </h2>
                <p className="mt-1 text-gray-400">{feature.description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1.5 8h13M10.5 4l4 4-4 4" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 6c-1.5-1.5-3.5-2-6-2v14c2.5 0 4.5.5 6 2 1.5-1.5 3.5-2 6-2V4c-2.5 0-4.5.5-6 2Z" />
      <path d="M12 6v14" />
    </svg>
  )
}

function ServerIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  )
}

function RoutesIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6H15a3 3 0 0 1 3 3v6.5M6 8.5V15a3 3 0 0 0 3 3h6.5" />
    </svg>
  )
}

function WidgetsIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  )
}
