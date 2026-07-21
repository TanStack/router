import { Link } from '@tanstack/react-router'

export interface WelcomeData {
  message: string
  generatedAt: string
}

export function HomeScreen({ welcome }: { welcome: WelcomeData }) {
  return (
    <section className="panel">
      <p className="eyebrow">ONE ROUTE TREE</p>
      <h1>Web and real native navigation</h1>
      <p>{welcome.message}</p>
      <p className="muted">Generated at {welcome.generatedAt}</p>
      <div className="actions">
        <Link to="/items/$itemId" params={{ itemId: 'router' }}>
          Open Router
        </Link>
        <Link to="/items/$itemId" params={{ itemId: 'start' }}>
          Open Start
        </Link>
      </div>
    </section>
  )
}
