import * as React from "react";
import { RouteImported, useRoute } from "react-location";

import { sleepCache } from "./App";

function Expensive() {
  const route = useRoute();
  return <>Expensive Data: {JSON.stringify(route.data)}</>;
}

export const route: RouteImported = {
  element: <Expensive />,
  loader: async () => ({
    expensive: await sleepCache.read("/expensive", 1000, 1000 * 10)
  })
};
