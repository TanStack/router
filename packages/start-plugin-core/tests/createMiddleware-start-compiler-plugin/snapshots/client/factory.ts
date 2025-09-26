import { createMiddleware } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
interface AuthMiddlewareOptions {
  allowUnauthenticated?: boolean;
}
interface AuthContext {
  session: {
    id: string;
  } | null;
}
export const createAuthMiddleware = (opts: AuthMiddlewareOptions = {
  allowUnauthenticated: false
}) => createMiddleware({
  type: "function"
});