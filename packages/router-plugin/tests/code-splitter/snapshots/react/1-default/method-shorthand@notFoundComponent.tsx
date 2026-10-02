function NotFoundComponent() {
  return <div>Not found</div>;
}
const SplitNotFoundComponent = function () {
  return <NotFoundComponent />;
};
export { SplitNotFoundComponent as notFoundComponent };