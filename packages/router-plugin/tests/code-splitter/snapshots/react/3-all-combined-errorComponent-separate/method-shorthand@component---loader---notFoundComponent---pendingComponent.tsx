import { fetchPosts } from '../posts';
function Component() {
  return <div>Component</div>;
}
function PendingComponent() {
  return <div>Pending</div>;
}
function NotFoundComponent() {
  return <div>Not found</div>;
}
const SplitLoader = async function ({
  context
}) {
  return await fetchPosts(context);
};
export { SplitLoader as loader };
const SplitComponent = function () {
  return <Component />;
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