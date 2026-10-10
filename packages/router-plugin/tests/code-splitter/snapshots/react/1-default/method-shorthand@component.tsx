import { obj } from "method-shorthand.tsx?tsr-shared=1";
function Component({
  name
}: {
  name: string;
}) {
  return <div>Component {name}</div>;
}
const SplitComponent = function () {
  return <Component name={obj.name} />;
};
export { SplitComponent as component };