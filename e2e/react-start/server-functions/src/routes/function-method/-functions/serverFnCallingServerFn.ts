import { createServerFn } from "@tanstack/react-start";

const postServerFn = createServerFn({ method: "POST" }).handler(({ method }) => {
    return {
        method,
    }
})

const getServerFn = createServerFn({ method: "GET" }).handler(({ method }) => {
    return {
        method,
    }
})

export const getServerFnCallingPost = createServerFn({ method: "GET" }).handler(async ({ method }) => {
    const innerFnResult = await postServerFn({});

    return {
        method,
        innerFnResult,
        name: 'getServerFnCallingPost',
    }
})

export const postServerFnCallingGet = createServerFn({ method: "POST" }).handler(async ({ method }) => {
    const innerFnResult = await getServerFn({});

    return {
        method,
        innerFnResult,
        name: 'postServerFnCallingGet',
    }
})