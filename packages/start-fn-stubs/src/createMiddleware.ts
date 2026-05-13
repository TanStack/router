export function createMiddleware(opts?: any, opts2?: any): any {
	const options = { ...(opts2 || opts) }
	const proxy = new Proxy({}, {
		get(_, prop) {
			if (prop === 'options') return options
			return (value: any) => {
				options[prop] = value
				return proxy
			}
		}
	})
	return proxy
}