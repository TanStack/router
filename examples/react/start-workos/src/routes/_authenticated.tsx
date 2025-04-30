import {  redirect } from '@tanstack/react-router';
import { getSignInUrl } from '../authkit/serverFunctions';

export const Route = createFileRoute({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      const path = location.pathname;
      const href = await getSignInUrl({ data: path });
      throw redirect({ href });
    }
  },
});
