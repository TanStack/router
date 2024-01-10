import { Link, Outlet, useRouterState } from "@tanstack/react-router";

import { FullFakebooksLogo, UpRightArrowIcon } from "./icons";
import { SignInButton, SignOutButton, useUser } from "@clerk/clerk-react";

export default function SideBar() {
  const { isSignedIn } = useUser();
  const router = useRouterState();
  const pathname = router.location.pathname;

  // currently when I redirect the user after sign in I have to click around before the auth context updates
  // and realizes that I can see protected routes. I can just redirect to the homepage but that isn't a nice user experience

  return (
    <div className="relative flex h-screen rounded-lg bg-white text-gray-600">
      <div className="border-r border-gray-100 bg-gray-50">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-1">
            <Link
              to="/"
              preload="intent"
              className="my-1 py-1 px-2 pr-16 text-[length:14px]"
              activeProps={{
                className: "rounded-md bg-gray-100",
              }}
            >
              <FullFakebooksLogo size="sm" position="left" />
            </Link>
          </div>
          <div className="h-7" />
          <div className="flex flex-col font-bold text-gray-800">
            <Link
              to="/"
              preload="intent"
              className="my-1 py-1 px-2 pr-16 text-[length:14px]"
              activeProps={{
                className: "rounded-md bg-gray-100",
              }}
            >
              Dashboard
            </Link>
            <Link
              to="/sales"
              preload="intent"
              className="my-1 py-1 px-2 pr-16 text-[length:14px]"
              activeProps={{
                className: "rounded-md bg-gray-100",
              }}
            >
              Sales
            </Link>

            <a
              href="https://github.com/FrontendMasters/advanced-remix"
              className="my-1 flex gap-1 py-1 px-2 pr-16 text-[length:14px]"
            >
              GitHub <UpRightArrowIcon />
            </a>

            {isSignedIn ? (
              <SignOutButton
                signOutCallback={() => window.location.replace("/")}
              />
            ) : (
              <SignInButton afterSignInUrl={pathname} />
            )}
          </div>
        </div>
      </div>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}

// function Spinner({ visible }: { visible: boolean }) {
//   return (
//     <SpinnerIcon
//       className={clsx("animate-spin transition-opacity", {
//         "opacity-0": !visible,
//         "opacity-100": visible,
//       })}
//     />
//   );
// }
