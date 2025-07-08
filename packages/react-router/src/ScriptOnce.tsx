import jsesc from 'jsesc'
import invariant from 'tiny-invariant'

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

  // Validate input to prevent XSS
  invariant(
    typeof children === 'string',
    'ScriptOnce children must be a string to prevent XSS attacks',
  )

  // Additional safety check for potentially dangerous content
  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    children.includes('<script')
  ) {
    console.warn(
      'ScriptOnce: Detected potentially unsafe script tag in children. This could lead to XSS vulnerabilities.',
    )
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
