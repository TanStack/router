import * as React from 'react'
import { Route as RouteType } from '@tanstack/react-router'

export function Route<TData>(
  _props: Omit<RouteType<TData>, 'children'> & {
    children?: React.ReactNode
  },
) {
  return null
}

export function elementsToRoutes(children: React.ReactNode): RouteType[] {
  let routes: RouteType[] = []

  React.Children.forEach(children, (element) => {
    if (!React.isValidElement(element)) return

    if (element.type === React.Fragment) {
      routes.push(...elementsToRoutes(element.props.children))
      return
    }

    if (!element.type === (Route as any)) {
      if (process.env.node_env !== 'production') {
        console.warn(
          'elementsToRoutes only supports <Route> and <React.Fragment> elements.',
        )
      }
      throw new Error()
    }

    let route: RouteType = { ...element.props }

    if (element.props.children) {
      route.children = elementsToRoutes(element.props.children)
    }

    routes.push(route)
  })

  return routes
}
