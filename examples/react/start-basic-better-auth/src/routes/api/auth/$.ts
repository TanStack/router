import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/utils/auth";

/**
 * Better Auth API route handler
 * Handles all auth routes: /api/auth/*
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
