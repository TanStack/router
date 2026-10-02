import { obj } from "method-shorthand.tsx?tsr-shared=1";
import { fetchPosts } from '../posts';
function Component({
  name
}: {
  name: string;
}) {
  return <div>Component {name}</div>;
}
function PendingComponent() {
  return <div>Pending {obj.name}</div>;
}
function NotFoundComponent() {
  return <div>Not found</div>;
}
const SplitLoader = async function ({
  context
}) {
  return await fetchPosts(context, obj);
};
export { SplitLoader as loader };
const SplitComponent = function () {
  return <Component name={obj.name} />;
};
export { SplitComponent as component };
const SplitPendingComponent = function () {
  return <PendingComponent />;
};
export { SplitPendingComponent as pendingComponent };
const SplitNotFoundComponent = function () {
  return <NotFoundComponent />;
};
export { SplitNotFoundComponent as notFoundComponent };