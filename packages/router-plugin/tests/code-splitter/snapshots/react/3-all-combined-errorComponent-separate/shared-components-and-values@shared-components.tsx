import {
  registry,
  label,
  columns,
} from 'shared-components-and-values.tsx?tsr-shared=1'
function Card() {
  registry.set('card', 'seen')
  return <section>{label(registry.size)}</section>
}
function Badge() {
  return <i>badge</i>
}
const Header = () => (
  <header>
    <Badge />
  </header>
)
function Table() {
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
export { Badge, Card, Header, Table }
