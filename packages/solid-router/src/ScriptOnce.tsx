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
      class="$tsr"
      innerHTML={[children].filter(Boolean).join('\n') + ';$_TSR.c()'}
    />
  )
}
