function ErrorComponent() {
  return <div>Error</div>;
}
const SplitErrorComponent = function () {
  return <ErrorComponent />;
};
export { SplitErrorComponent as errorComponent };