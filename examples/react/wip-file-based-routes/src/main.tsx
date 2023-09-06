import { routeTree } from "@/route-tree.gen";
import { Router, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import "@/index.css";

const router = new Router({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
