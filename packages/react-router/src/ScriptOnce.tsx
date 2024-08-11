/* eslint-disable @eslint-react/dom/no-dangerously-set-innerhtml */
export function ScriptOnce({
  className,
  children,
  ...rest
}: { children: string } & React.HTMLProps<HTMLScriptElement>) {
  if (typeof document !== 'undefined') {
    return null
  }

  return (
    <script
      {...rest}
      className={['tsr-once', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{
        __html: [children].filter(Boolean).join('\n'),
      }}
    />
  )
}
