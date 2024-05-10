import * as React from 'react'
import { Link, type LinkProps, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/linkProps')({
  component: LinkPropsPage,
})

function LinkPropsPage() {
  const linkProps: LinkProps = {
    to: '/absolute11',
  }

  return <Link {...linkProps} />
}
