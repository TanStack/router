import { createFileRoute, redirect } from '@tanstack/octane-router';

export const Route = createFileRoute('/redirect')({
	beforeLoad: () => {
		throw redirect({ to: '/about' });
	},
});
