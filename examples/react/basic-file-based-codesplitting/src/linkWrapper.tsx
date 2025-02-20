import { Link, type LinkProps } from '@tanstack/react-router';  

export function LinkWrapper({ className, children, search, to }: { className?: string; children: React.ReactNode; to: string, search: (prev: Record<string, string>) => Record<string, string> }) {
  return <Link rel="noreferrer" preload="intent" to={to} search={search} className={className}>{children}</Link>
}

export function LinkWrapperWithFrom({ className, children, from, search, to }: { className?: string; children: React.ReactNode; to: string, from?: LinkProps['from'], search: (prev: Record<string, string>) => Record<string, string> }) {
  return <Link rel="noreferrer" preload="intent" to={to} search={search} from={from} className={className}>{children}</Link>
}
