import { Link } from '@tanstack/react-router'

export function NotFound({ children }: { children?: any }) {
  return (
    <div className="h-[50vh] flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold">404 Not Found</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        The page you are looking for does not exist.
      </p>
      {children || (
        <p className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => window.history.back()}
            className="bg-emerald-500 text-white p-2 rounded uppercase font-black"
          >
            Go back
          </button>
          <Link
            to="/"
            className="bg-cyan-600 text-white p-2 rounded uppercase font-black"
          >
            Start Over
          </Link>
        </p>
      )}
    </div>
  )
}
