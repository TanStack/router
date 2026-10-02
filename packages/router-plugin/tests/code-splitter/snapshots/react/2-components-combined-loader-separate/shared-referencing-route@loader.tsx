import { HEADER } from "shared-referencing-route.tsx?tsr-shared=1";
import { Route } from "shared-referencing-route.tsx";
function usePageTitle() {
  return `${HEADER} - ${Route.fullPath}`;
}
const SplitLoader = async () => {
  const title = usePageTitle();
  return { title };
};
export { SplitLoader as loader };