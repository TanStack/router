import * as React from 'react'
import {
  Route as RouteType,
  PartialGenerics,
  DefaultGenerics,
} from 'react-location'

export function Route<TGenerics extends PartialGenerics = DefaultGenerics>(
  _props: Omit<RouteType<TGenerics>, 'children'> & {
    children: React.ReactNode
  },
) {
  return null
}

export function elementsToRoutes<
  TGenerics extends PartialGenerics = DefaultGenerics,
>(children: React.ReactNode): RouteType<TGenerics>[] {
  let routes: RouteType<TGenerics>[] = []

  React.Children.forEach(children, (element) => {
    if (!React.isValidElement(element)) return

    if (element.type === React.Fragment) {
      routes.push(...elementsToRoutes<TGenerics>(element.props.children))
      return
    }

    if (!element.type === (Route as any)) {
      if (__DEV__) {
        console.warn(
          'elementsToRoutes only supports <Route> and <React.Fragment> elements.',
        )
      }
      throw new Error()
    }

    let route: RouteType<TGenerics> = element.props

    if (element.props.children) {
      route.children = elementsToRoutes(element.props.children)
    }

    routes.push(route)
  })

  return routes
}
