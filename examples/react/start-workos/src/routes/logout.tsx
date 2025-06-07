import { createFileRoute } from '@tanstack/react-router';
import { signOut } from '../authkit/serverFunctions';

export const Route = createFileRoute('/logout')({
  preload: false,
  loader: () => signOut(),
});
