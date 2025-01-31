import { useServerFn } from '@tanstack/start'
import { throwRedirect } from './throwRedirect'

interface RedirectOnClickProps {
  target: 'internal' | 'external'
  reloadDocument?: boolean
}

export function RedirectOnClick({
  target,
  reloadDocument,
}: RedirectOnClickProps) {
  const execute = useServerFn(throwRedirect)
  return (
    <button
      data-testid="redirect-on-click"
      onClick={() => execute({ data: { target, reloadDocument } })}
    >
      click me
    </button>
  )
}
