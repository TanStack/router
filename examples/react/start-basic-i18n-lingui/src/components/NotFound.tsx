import { Trans } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'

export function NotFound({ children }: { children?: any }) {
  return (
    <div className="space-y-2 p-2">
      <div className="text-gray-600 dark:text-gray-400">
        {children || <p><Trans>The page you are looking for does not exist.</Trans></p>}
      </div>
      <p className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => window.history.back()}
          className="bg-emerald-500 text-white px-2 py-1 rounded uppercase font-black text-sm"
        >
          <Trans>Go back</Trans>
        </button>
        <Link
          to="/"
          className="bg-cyan-600 text-white px-2 py-1 rounded uppercase font-black text-sm"
        >
          <Trans>Start Over</Trans>
        </Link>
      </p>
    </div>
  )
}
