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
      class="tsr-once"
      innerHTML={[children].filter(Boolean).join('\n')}
    />
  )
}
