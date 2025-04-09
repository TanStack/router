import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { signOut } from '../authkit/serverFunctions';

const logoutFn = createServerFn().handler(async () => {
  await signOut();
});

export const Route = createFileRoute('/logout')({
  preload: false,
  loader: () => logoutFn(),
});
