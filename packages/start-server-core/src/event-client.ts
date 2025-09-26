import { EventClient } from "@tanstack/devtools-event-client";

interface StartEventMap {
  "start:middleware": {},
  "start:request-received": {
    headers: Headers;
    url: string;
    method: string;
  };

}

class StartEventClient extends EventClient<StartEventMap> {
  constructor() {
    super({
      pluginId: 'start',
      // Add any other necessary options here
    })
  }
}

const startEventClient = new StartEventClient()

export { startEventClient }