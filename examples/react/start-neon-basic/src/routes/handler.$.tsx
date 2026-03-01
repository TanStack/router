import { StackHandler } from "@stackframe/react";
import { stackClientApp } from "../stack";
import { useRouter, createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

function HandlerComponent() {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <div>Loading...</div>;
  }

  return <StackHandler app={stackClientApp} location={pathname} fullPage />;
}

// @ts-ignore - TanStack Start file-based routing expects no arguments
export const Route = createFileRoute("/handler/$")({
  component: HandlerComponent,
}); 