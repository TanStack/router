export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}
