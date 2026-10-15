import { createFileRoute } from '@tanstack/react-router'

const registry = new Map<string, string>()

function label(size: number) {
  return `${size} entries`
}

export function Card() {
  registry.set('card', 'seen')
  return <section>{label(registry.size)}</section>
}

function Badge() {
  return <i>badge</i>
}

export const Header = () => (
  <header>
    <Badge />
  </header>
)

function Cell() {
  return <td>cell</td>
}

const columns = [{ key: 'cell', render: Cell }]

export function Table() {
  return (
    <table>
      <tbody>
        <tr>
          {columns.map((column) => (
            <column.render key={column.key} />
          ))}
        </tr>
      </tbody>
    </table>
  )
}

function Page() {
  return (
    <main>
      <Header />
      <Card />
      <Table />
    </main>
  )
}

export const Route = createFileRoute('/')({
  loader: () => label(registry.size),
  component: Page,
})
