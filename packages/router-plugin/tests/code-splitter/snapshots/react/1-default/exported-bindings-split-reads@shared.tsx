class Store {
  items = new Map<string, number>()
}
let renders = 0
function countRender() {
  return ++renders
}
export { Store, countRender, renders }
