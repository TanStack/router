import { useRouter } from "./useRouter";
import type { ParsedLocation } from "./location";
import type { FullSearchSchema } from "./routeInfo";
import type { AnyRoute } from "./route";


export function useLocation<TRouteTree extends AnyRoute = AnyRoute>(): ParsedLocation<FullSearchSchema<TRouteTree>> {
  const router = useRouter();
  return router.state.location;
}