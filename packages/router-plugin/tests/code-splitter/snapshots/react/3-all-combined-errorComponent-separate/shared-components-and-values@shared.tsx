const registry = new Map<string, string>()
function label(size: number) {
  return `${size} entries`
}
function Cell() {
  return <td>cell</td>
}
const columns = [{ key: 'cell', render: Cell }]
export { Cell, columns, label, registry }
