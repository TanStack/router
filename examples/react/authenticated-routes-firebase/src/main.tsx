import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'
import { AuthContextProvider, AuthContextType, useAuth } from './auth'
import { Loader2Icon } from "lucide-react";

import './styles.css'

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  context: {
    isAuthenticated: false, // This will be set after we wrap the app in AuthContextProvider
		isInitialLoading: true, // This will be set after we wrap the app in AuthContextProvider
		user: null, // This will be set after we wrap the app in AuthContextProvider
		login: () => Promise.resolve(), // This will be set after we wrap the app in AuthContextProvider
		logout: () => Promise.resolve(), // This will be set after we wrap the app in AuthContextProvider
  },
})

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
    context: {
			isAuthenticated: AuthContextType["isAuthenticated"];
			isInitialLoading: AuthContextType["isInitialLoading"];
			user: AuthContextType["user"];
			login: AuthContextType["login"];
			logout: AuthContextType["logout"];
		};
  }
}

function InnerApp() {
	const auth = useAuth();

	// If the provider is initially loading, do not render the router
	if (auth.isInitialLoading) {
		return (
			<div className="flex h-screen w-full items-center justify-center p-4">
				<Loader2Icon className="size-10 animate-spin text-foreground" />
			</div>
		);
	}

	return <RouterProvider router={router} context={{ ...auth }} />;
}

function App() {
  return (
    <AuthContextProvider>
      <InnerApp />
    </AuthContextProvider>
  )
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
