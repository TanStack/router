import { LocalizedLink } from '../components/localized-link'

export default function Header() {
  return (
    <>
      <header className="p-4 flex items-center bg-gray-800 text-white shadow-lg">
        <h1 className="ml-4 text-xl font-semibold">
          <LocalizedLink to="/">
            <img
              alt="TanStack Logo"
              className="h-10"
              src="/tanstack-word-logo-white.svg"
            />
          </LocalizedLink>
        </h1>
      </header>
    </>
  )
}
