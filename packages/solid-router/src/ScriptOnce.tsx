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
      class="tsr-once"
      innerHTML={[
          children,
          (log ?? true) && process.env.NODE_ENV === 'development'
            ? `console.info(\`Injected From Server:
${jsesc(children.toString(), { quotes: 'backtick' })}\`)`
            : '',
          'if (typeof __TSR__ !== "undefined") __TSR__.cleanScripts()',
        ]
          .filter(Boolean)
          .join('\n')
      }
    />
  )
}
