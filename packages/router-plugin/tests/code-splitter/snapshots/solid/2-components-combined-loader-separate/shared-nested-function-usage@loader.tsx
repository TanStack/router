// Variable used inside nested function
const collection = {
  name: 'todos',
  items: []
};
function loadData() {
  return collection.items;
}
export { loadData as loader };