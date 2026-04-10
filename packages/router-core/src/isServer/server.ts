export const isServer: true | undefined = process.env.NODE_ENV === 'test' ? undefined : true
