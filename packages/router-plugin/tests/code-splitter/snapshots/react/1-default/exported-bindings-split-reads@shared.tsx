function Card({ title }: { title: string }) {
  return <section>{title}</section>
}
class Store {
  items = new Map<string, number>()
}
let renders = 0
function countRender() {
  return ++renders
}
export { Card, Store, countRender, renders }
