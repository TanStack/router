import { obj } from "method-shorthand.tsx?tsr-shared=1";
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
function ErrorComponent() {
  return <div>Error</div>;
}
const SplitComponent = function () {
  return <Component name={obj.name} />;
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