import jsesc from 'jsesc'
import { splitProps } from 'solid-js'
import type { ComponentProps } from 'solid-js'

export function ScriptOnce(
  props: { children: string; log?: boolean } & Omit<
    ComponentProps<'script'>,
    'children'
  >,
) {
  if (typeof document !== 'undefined') {
    return null
  }

  const [local, rest] = splitProps(props, ['class', 'children', 'log'])

  return (
    <script
      {...rest}
      class={`tsr-once ${local.class || ''}`}
      innerHTML={[
        local.children,
        (local.log ?? true) && process.env.NODE_ENV === 'development'
          ? `console.info(\`Injected From Server:
${jsesc(local.children, { quotes: 'backtick' })}\`)`
          : '',
        'if (typeof __TSR__ !== "undefined") __TSR__.cleanScripts()',
      ]
        .filter(Boolean)
        .join('\n')}
    />
  )
}
