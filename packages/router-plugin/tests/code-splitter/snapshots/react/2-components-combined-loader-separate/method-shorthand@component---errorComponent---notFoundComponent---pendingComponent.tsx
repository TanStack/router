function Component() {
  return <div>Component</div>;
}
function PendingComponent() {
  return <div>Pending</div>;
}
function NotFoundComponent() {
  return <div>Not found</div>;
}
function ErrorComponent() {
  return <div>Error</div>;
}
const SplitComponent = function () {
  return <Component />;
};
export { SplitComponent as component };
const SplitPendingComponent = function () {
  return <PendingComponent />;
};
export { SplitPendingComponent as pendingComponent };
const SplitErrorComponent = function () {
  return <ErrorComponent />;
};
export { SplitErrorComponent as errorComponent };
const SplitNotFoundComponent = function () {
  return <NotFoundComponent />;
};
export { SplitNotFoundComponent as notFoundComponent };