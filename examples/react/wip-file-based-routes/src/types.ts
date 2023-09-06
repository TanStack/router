import { FileRoutesByPath } from "@tanstack/react-router"

export type Route = {
    label: string,
    to: keyof FileRoutesByPath
}

export type Post = {
    id: string
    title: string
    body: string
}