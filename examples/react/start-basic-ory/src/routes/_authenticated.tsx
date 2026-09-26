import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

const ORY_BASE = import.meta.env.VITE_ORY_SDK_URL ?? 'http://localhost:4000'

export const Route = createFileRoute('/_authenticated')({
    beforeLoad: ({ context }) => {
        if (!context.auth.isAuthenticated) {
            throw redirect({ href: `${ORY_BASE}/self-service/login/browser` })
        }
    },
    component: () => <Outlet />,
})
