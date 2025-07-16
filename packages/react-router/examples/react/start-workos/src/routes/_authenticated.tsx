import { redirect, createFileRoute } from '@tanstack/react-router';
import { getSignInUrl } from '../authkit/serverFunctions';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      const path = location.pathname;
      const href = await getSignInUrl({ data: path });
      throw redirect({ href });
    }
  },
});
