import { HEADER } from "shared-referencing-route.tsx?tsr-shared=1";
import { Route } from "shared-referencing-route.tsx";
function usePageTitle() {
  return `${HEADER} - ${Route.fullPath}`;
}
const SplitComponent = () => {
  const title = usePageTitle();
  return <div>{title}</div>;
};
export { SplitComponent as component };