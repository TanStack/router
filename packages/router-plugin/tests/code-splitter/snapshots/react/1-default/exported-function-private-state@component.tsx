import { format } from "exported-function-private-state.tsx";
const state = { count: 0 };
function increment() {
  return ++state.count;
}
let renders = 0;
function getRenders() {
  return renders;
}
function Page() {
  increment();
  renders++;
  return (<p>
      {format(state.count)} {getRenders()}
    </p>);
}
export { Page as component };