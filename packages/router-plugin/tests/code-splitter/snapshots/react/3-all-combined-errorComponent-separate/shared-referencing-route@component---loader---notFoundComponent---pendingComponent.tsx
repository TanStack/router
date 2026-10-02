import { Route } from "shared-referencing-route.tsx";
const HEADER = 'Page';
function usePageTitle() {
  return `${HEADER} - ${Route.fullPath}`;
}
const SplitLoader = async () => {
  const title = usePageTitle();
  return { title };
};
export { SplitLoader as loader };
const SplitComponent = () => {
  const title = usePageTitle();
  return <div>{title}</div>;
};
export { SplitComponent as component };