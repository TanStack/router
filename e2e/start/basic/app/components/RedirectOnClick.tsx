import { useServerFn } from '@tanstack/start'
import { throwRedirect } from './throwRedirect'

interface RedirectOnClickProps {
  target: 'internal' | 'external'
}

export function RedirectOnClick({ target }: RedirectOnClickProps) {
  const execute = useServerFn(throwRedirect)
  return <button onClick={() => execute(target)}>click me</button>
}
