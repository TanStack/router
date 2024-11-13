import { createFileRoute } from '@tanstack/react-router'
import { SignedIn, SignedOut, SignIn } from "@clerk/tanstack-start";

export const Route = createFileRoute('/_authed')({
  component: () => (
		<div>
			<SignedOut>
				<SignIn />
			</SignedOut>
			<SignedIn>
				<Outlet />
			</SignedIn>
		</div>
	),
})
