import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./routes";
import {
  Loader,
  LoaderClient,
  useLoaderClient,
  LoaderClientProvider,
  typedClient,
  useLoaderInstance,
  createLoaderOptions,
} from "@tanstack/react-loaders";
import { loaderClient } from "./loaders";
import { actionClient } from "./actions";
import { ActionClientProvider } from "@tanstack/react-actions";

// Register the loaders

declare module "@tanstack/react-loaders" {
  interface Register {
    loaderClient: typeof loaderClient;
  }
}

// Register the actions

declare module "@tanstack/react-actions" {
  interface Register {
    actionClient: typeof actionClient;
  }
}

// Register things for typesafety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const clerk_pub_key = import.meta.env.VITE_REACT_APP_CLERK_PUBLISHABLE_KEY;
const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    // <React.StrictMode>
    <ClerkProvider publishableKey={clerk_pub_key}>
      <LoaderClientProvider
        client={loaderClient}
        // defaultMaxAge={defaultLoaderMaxAge}
      >
        <ActionClientProvider client={actionClient}>
          <RouterProvider router={router} />
        </ActionClientProvider>
      </LoaderClientProvider>
    </ClerkProvider>

    // </React.StrictMode>,
  );
}
