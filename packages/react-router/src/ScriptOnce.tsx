import jsesc from 'jsesc'
import { useRouter } from './useRouter'

export function ScriptOnce({
  children,
  log,
  sync,
}: {
  children: string
  log?: boolean
  sync?: boolean
}) {
  const router = useRouter()
  if (typeof document !== 'undefined') {
    return null
  }

  if (!sync) {
    router.injectScript(children, { logScript: log })
    return null
  }

  return (
    <script
      className="tsr-once"
      dangerouslySetInnerHTML={{
        __html: [
          children,
          (log ?? true) && process.env.NODE_ENV === 'development'
            ? `console.info(\`Injected From Server:
${jsesc(children.toString(), { quotes: 'backtick' })}\`)`
            : '',
          'if (typeof __TSR__ !== "undefined") __TSR__.cleanScripts()',
        ]
          .filter(Boolean)
          .join('\n'),
      }}
    />
  )
}
