import { Link } from '@tanstack/react-router'

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <main data-testid="default-not-found-component">
      {children || <p>The page you are looking for does not exist.</p>}
      <Link to="/">Start Over</Link>
    </main>
  )
}
