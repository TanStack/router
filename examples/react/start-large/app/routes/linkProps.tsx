import * as React from 'react'
import { Link, createFileRoute, linkOptions } from '@tanstack/react-router'
import {
  customRedirect,
  ListItems,
  MyLink,
  useCustomNavigate,
} from '~/typePrimitives'

export const Route = createFileRoute('/linkProps')({
  component: LinkPropsPage,
  loader: () => {
    throw customRedirect({
      to: '/search/searchPlaceholder',
      search: {
        searchPlaceholder: 'searchPlaceholder',
        rootSearch: 0,
        page: 0,
        offset: 0,
        search: 'hi',
      },
    })
  },
})

function LinkPropsPage() {
  useCustomNavigate({
    to: '/search/searchPlaceholder',
    search: {
      searchPlaceholder: 'searchPlaceholder',
      rootSearch: 0,
      page: 0,
      offset: 0,
      search: 'hi',
    },
  })

  const linkProps = linkOptions({
    to: '/absolute',
  })

  return (
    <React.Fragment>
      <MyLink
        from="/search/searchPlaceholder"
        to="../searchPlaceholder"
        search={{
          searchPlaceholder: 'searchPlaceholder',
          rootSearch: 0,
          page: 0,
          offset: 0,
          search: 'hi',
        }}
      />
      <ListItems
        from="/search/searchPlaceholder"
        items={[
          {
            to: '../searchPlaceholder',
            search: {
              searchPlaceholder: 'searchPlaceholder',
              rootSearch: 0,
              page: 0,
              offset: 0,
              search: 'hi',
            },
          },
        ]}
      />
      <Link {...linkProps} />
    </React.Fragment>
  )
}
