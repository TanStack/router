import ReactDOM from "react-dom/client";
import { ClerkProvider, useUser, useSession } from "@clerk/clerk-react";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./routes";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./routes";

// Register things for typesafety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const clerk_pub_key = import.meta.env.VITE_REACT_APP_CLERK_PUBLISHABLE_KEY;
const rootElement = document.getElementById("app")!;

const Root = () => {
  const userInfo = useUser();
  const sessionInfo = useSession();
  const authentication = {
    user: userInfo.user,
    isSignedIn: userInfo.isSignedIn,
    session: sessionInfo.session,
  };

  return (
    <>
      <RouterProvider router={router} context={{ authentication }} />
    </>
  );
};

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    // <React.StrictMode>
    <ClerkProvider publishableKey={clerk_pub_key}>
      <QueryClientProvider client={queryClient}>
        <Root />
      </QueryClientProvider>
    </ClerkProvider>

    // </React.StrictMode>,
  );
}
