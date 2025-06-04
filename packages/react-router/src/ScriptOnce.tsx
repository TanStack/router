import jsesc from 'jsesc'

export function ScriptOnce({
  children,
  log,
}: {
  children: string
  log?: boolean
  sync?: boolean
}) {
  if (typeof document !== 'undefined') {
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
          'if (typeof __TSR_SSR__ !== "undefined") __TSR_SSR__.cleanScripts()',
        ]
          .filter(Boolean)
          .join('\n'),
      }}
    />
  )
}
