const registry = new Map<string, string>()
function label(size: number) {
  return `${size} entries`
}
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
function Cell() {
  return <td>cell</td>
}
const columns = [{ key: 'cell', render: Cell }]
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
export { Badge, Card, Cell, Header, Table, columns, label, registry }
