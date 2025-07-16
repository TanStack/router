export function ScriptOnce({
  children,
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
      className="$tsr"
      dangerouslySetInnerHTML={{
        __html: [children].filter(Boolean).join('\n'),
      }}
    />
  )
}
