import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

/**
 * Better Auth configuration for TanStack Start with GitHub
 */
export const auth = betterAuth({
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  plugins: [
    // Must be last plugin in the array
    tanstackStartCookies(),
  ],
  // Stateless sessions (no database required)
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7,
    },
  },
});

// Export session type for use in router context
export type AuthSession = typeof auth.$Infer.Session;
