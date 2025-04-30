;
import { signOut } from '../authkit/serverFunctions';

export const Route = createFileRoute({
  preload: false,
  loader: () => signOut(),
});
