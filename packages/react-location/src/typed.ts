import {
  Link as vLink,
  LinkType,
  LinkPropsType,
  MakeGenerics,
  useMatch as vUseMatch,
  UseMatchType,
  useMatches as vUseMatches,
  UseMatchesType,
  Navigate as vNavigate,
  NavigateType,
  useNavigate as vUseNavigate,
  UseNavigateType,
  useSearch as vUseSearch,
  UseSearchType,
  useMatchRoute as vUseMatchRoute,
  UseMatchRouteType,
  useRouter as vUseRouter,
  UseRouterType,
  Router as vRouter,
  RouterType,
  RouterPropsType,
  useLocation as vUseLocation,
  UseLocationType,
  useLoadRoute as vUseLoadRoute,
  UseLoadRouteType,
  matchRoute as vMatchRoute,
  MatchRouteType,
  matchRoutes as vMatchRoutes,
  MatchRoutesType,
} from './index'

export type Generics = MakeGenerics<{
  Params: {
    testing: string
  }
  LoaderData: {
    query: any
    boardPath: string
  }
}>

export type LinkProps = LinkPropsType<Generics>
export const Link: LinkType<Generics> = vLink

export type RouterProps = RouterPropsType<Generics>
export const Router: RouterType<Generics> = vRouter

export const Navigate: NavigateType<Generics> = vNavigate

export const useLocation: UseLocationType<Generics> = vUseLocation
export const useSearch: UseSearchType<Generics> = vUseSearch
export const useNavigate: UseNavigateType<Generics> = vUseNavigate
export const useMatch: UseMatchType<Generics> = vUseMatch
export const useMatches: UseMatchesType<Generics> = vUseMatches
export const useMatchRoute: UseMatchRouteType<Generics> = vUseMatchRoute
export const useRouter: UseRouterType<Generics> = vUseRouter
export const useLoadRoute: UseLoadRouteType<Generics> = vUseLoadRoute

export const matchRoute: MatchRouteType<Generics> = vMatchRoute
export const matchRoutes: MatchRoutesType<Generics> = vMatchRoutes
