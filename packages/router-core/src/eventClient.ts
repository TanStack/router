import { EventClient } from "@tanstack/devtools-event-client";

interface RouterEventMap {
  "tanstack-router:state-change": any,
}

export const routerEventClient = new EventClient<RouterEventMap>({
  pluginId: "tanstack-router"
})