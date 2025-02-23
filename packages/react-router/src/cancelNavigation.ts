export function cancelNavigation() {
  return { __isCancelNavigation: true }
}

export function isCancelNavigation(obj: any) {
  return !!obj?.__isCancelNavigation
}
