import { createFileRoute, redirect } from '@tanstack/react-router';
import { getAuth } from '@workos/authkit-tanstack-react-start';

export const Route = createFileRoute('/_authenticated')({
  loader: async ({ location }) => {
    // Loader runs on server (even during client-side navigation via RPC)
    const { user } = await getAuth();
    if (!user) {
      const returnPathname = encodeURIComponent(location.pathname);
      throw redirect({ href: `/api/auth/sign-in?returnPathname=${returnPathname}` });
    }
  },
});
