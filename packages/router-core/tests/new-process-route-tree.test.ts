import { describe, expect, it } from 'vitest'
import { findRouteMatch, processFlatRouteList, processRouteTree } from "../src/new-process-route-tree"
import type { AnyRoute, RouteMask } from "../src"

describe('processFlatRouteList', () => {
	it('processes a route masks list', () => {
		const routeTree = {} as AnyRoute
		const routeMasks: Array<RouteMask<AnyRoute>> = [
			{ from: '/a/b/c', routeTree },
			{ from: '/a/b/d', routeTree },
			{ from: '/a/$param/d', routeTree },
			{ from: '/a/{-$optional}/d', routeTree },
			{ from: '/a/b/{$}.txt', routeTree },
		]
		expect(processFlatRouteList(routeMasks)).toMatchInlineSnapshot(`
			{
			  "depth": 0,
			  "dynamic": null,
			  "fullPath": "/",
			  "kind": 0,
			  "optional": null,
			  "parent": null,
			  "route": null,
			  "static": null,
			  "staticInsensitive": Map {
			    "a" => {
			      "depth": 2,
			      "dynamic": [
			        {
			          "caseSensitive": false,
			          "depth": 2,
			          "dynamic": null,
			          "fullPath": "/a/$param/d",
			          "kind": 1,
			          "optional": null,
			          "parent": [Circular],
			          "prefix": undefined,
			          "route": null,
			          "static": null,
			          "staticInsensitive": Map {
			            "d" => {
			              "depth": 3,
			              "dynamic": null,
			              "fullPath": "/a/$param/d",
			              "kind": 0,
			              "optional": null,
			              "parent": [Circular],
			              "route": {
			                "from": "/a/$param/d",
			                "routeTree": {},
			              },
			              "static": null,
			              "staticInsensitive": null,
			              "wildcard": null,
			            },
			          },
			          "suffix": undefined,
			          "wildcard": null,
			        },
			      ],
			      "fullPath": "/a/b/c",
			      "kind": 0,
			      "optional": [
			        {
			          "caseSensitive": false,
			          "depth": 2,
			          "dynamic": null,
			          "fullPath": "/a/{-$optional}/d",
			          "kind": 3,
			          "optional": null,
			          "parent": [Circular],
			          "prefix": undefined,
			          "route": null,
			          "static": null,
			          "staticInsensitive": Map {
			            "d" => {
			              "depth": 3,
			              "dynamic": null,
			              "fullPath": "/a/{-$optional}/d",
			              "kind": 0,
			              "optional": null,
			              "parent": [Circular],
			              "route": {
			                "from": "/a/{-$optional}/d",
			                "routeTree": {},
			              },
			              "static": null,
			              "staticInsensitive": null,
			              "wildcard": null,
			            },
			          },
			          "suffix": undefined,
			          "wildcard": null,
			        },
			      ],
			      "parent": [Circular],
			      "route": null,
			      "static": null,
			      "staticInsensitive": Map {
			        "b" => {
			          "depth": 3,
			          "dynamic": null,
			          "fullPath": "/a/b/c",
			          "kind": 0,
			          "optional": null,
			          "parent": [Circular],
			          "route": null,
			          "static": null,
			          "staticInsensitive": Map {
			            "c" => {
			              "depth": 4,
			              "dynamic": null,
			              "fullPath": "/a/b/c",
			              "kind": 0,
			              "optional": null,
			              "parent": [Circular],
			              "route": {
			                "from": "/a/b/c",
			                "routeTree": {},
			              },
			              "static": null,
			              "staticInsensitive": null,
			              "wildcard": null,
			            },
			            "d" => {
			              "depth": 2,
			              "dynamic": null,
			              "fullPath": "/a/b/d",
			              "kind": 0,
			              "optional": null,
			              "parent": [Circular],
			              "route": {
			                "from": "/a/b/d",
			                "routeTree": {},
			              },
			              "static": null,
			              "staticInsensitive": null,
			              "wildcard": null,
			            },
			          },
			          "wildcard": [
			            {
			              "caseSensitive": false,
			              "depth": 2,
			              "dynamic": null,
			              "fullPath": "/a/b/{$}.txt",
			              "kind": 2,
			              "optional": null,
			              "parent": [Circular],
			              "prefix": undefined,
			              "route": {
			                "from": "/a/b/{$}.txt",
			                "routeTree": {},
			              },
			              "static": null,
			              "staticInsensitive": null,
			              "suffix": ".txt",
			              "wildcard": null,
			            },
			          ],
			        },
			      },
			      "wildcard": null,
			    },
			  },
			  "wildcard": null,
			}
		`)
	})
})

describe('findMatch', () => {
	const testTree = {
		id: '__root__',
		fullPath: '/',
		path: '/',
		children: [
			{
				id: '/yo',
				fullPath: '/yo',
				path: 'yo',
				children: [
					{
						id: '/yo/foo{-$id}bar',
						fullPath: '/yo/foo{-$id}bar',
						path: 'foo{-$id}bar',
						children: [
							{
								id: '/yo/foo{-$id}bar/ma',
								fullPath: '/yo/foo{-$id}bar/ma',
								path: 'ma',
							}
						]
					},
					{
						id: '/yo/{$}.png',
						fullPath: '/yo/{$}.png',
						path: '{$}.png',
					},
					{
						id: '/yo/$',
						fullPath: '/yo/$',
						path: '$',
					}
				]
			}, {
				id: '/foo',
				fullPath: '/foo',
				path: 'foo',
				children: [
					{
						id: '/foo/$a/aaa',
						fullPath: '/foo/$a/aaa',
						path: '$a/aaa',
					}, {
						id: '/foo/$b/bbb',
						fullPath: '/foo/$b/bbb',
						path: '$b/bbb',
					}
				]
			}, {
				id: '/x/y/z',
				fullPath: '/x/y/z',
				path: 'x/y/z',
			}, {
				id: '/$id/y/w',
				fullPath: '/$id/y/w',
				path: '$id/y/w',
			}, {
				id: '/{-$other}/posts/new',
				fullPath: '/{-$other}/posts/new',
				path: '{-$other}/posts/new',
			}, {
				id: '/posts/$id',
				fullPath: '/posts/$id',
				path: 'posts/$id',
			}
		]
	}

	const { processedTree } = processRouteTree(testTree)

	it('foo', () => {
		expect(findRouteMatch('/posts/new', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "other": "",
			  },
			  "route": {
			    "fullPath": "/{-$other}/posts/new",
			    "id": "/{-$other}/posts/new",
			    "path": "{-$other}/posts/new",
			  },
			}
		`)
		expect(findRouteMatch('/yo/posts/new', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "other": "yo",
			  },
			  "route": {
			    "fullPath": "/{-$other}/posts/new",
			    "id": "/{-$other}/posts/new",
			    "path": "{-$other}/posts/new",
			  },
			}
		`)
		expect(findRouteMatch('/x/y/w', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "id": "x",
			  },
			  "route": {
			    "fullPath": "/$id/y/w",
			    "id": "/$id/y/w",
			    "path": "$id/y/w",
			  },
			}
		`)
	})



	it('works w/ optional params when param is present', () => {
		expect(findRouteMatch('/yo/foo123bar/ma', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "id": "123",
			  },
			  "route": {
			    "fullPath": "/yo/foo{-$id}bar/ma",
			    "id": "/yo/foo{-$id}bar/ma",
			    "path": "ma",
			  },
			}
		`)
	})
	it('works w/ optional params when param is absent', () => {
		expect(findRouteMatch('/yo/ma', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "id": "",
			  },
			  "route": {
			    "fullPath": "/yo/foo{-$id}bar/ma",
			    "id": "/yo/foo{-$id}bar/ma",
			    "path": "ma",
			  },
			}
		`)
	})
	it('works w/ wildcard and suffix', () => {
		expect(findRouteMatch('/yo/somefile.png', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "*": "somefile",
			  },
			  "route": {
			    "fullPath": "/yo/{$}.png",
			    "id": "/yo/{$}.png",
			    "path": "{$}.png",
			  },
			}
		`)
	})
	it('works w/ wildcard alone', () => {
		expect(findRouteMatch('/yo/something', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "*": "something",
			  },
			  "route": {
			    "fullPath": "/yo/$",
			    "id": "/yo/$",
			    "path": "$",
			  },
			}
		`)
	})
	it('works w/ multiple required param routes at same level, w/ different names for their param', () => {
		expect(findRouteMatch('/foo/123/aaa', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "a": "123",
			  },
			  "route": {
			    "fullPath": "/foo/$a/aaa",
			    "id": "/foo/$a/aaa",
			    "path": "$a/aaa",
			  },
			}
		`)
		expect(findRouteMatch('/foo/123/bbb', processedTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "b": "123",
			  },
			  "route": {
			    "fullPath": "/foo/$b/bbb",
			    "id": "/foo/$b/bbb",
			    "path": "$b/bbb",
			  },
			}
		`)
	})

	it('works w/ fuzzy matching', () => {
		expect(findRouteMatch('/foo/123', processedTree, true)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "**": "/123",
			  },
			  "route": {
			    "children": [
			      {
			        "fullPath": "/foo/$a/aaa",
			        "id": "/foo/$a/aaa",
			        "path": "$a/aaa",
			      },
			      {
			        "fullPath": "/foo/$b/bbb",
			        "id": "/foo/$b/bbb",
			        "path": "$b/bbb",
			      },
			    ],
			    "fullPath": "/foo",
			    "id": "/foo",
			    "path": "foo",
			  },
			}
		`)
	})
	it('can still return exact matches w/ fuzzy:true', () => {
		expect(findRouteMatch('/yo/foobar', processedTree, true)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "id": "",
			  },
			  "route": {
			    "children": [
			      {
			        "fullPath": "/yo/foo{-$id}bar/ma",
			        "id": "/yo/foo{-$id}bar/ma",
			        "path": "ma",
			      },
			    ],
			    "fullPath": "/yo/foo{-$id}bar",
			    "id": "/yo/foo{-$id}bar",
			    "path": "foo{-$id}bar",
			  },
			}
		`)
	})
	it('can still match a wildcard route w/ fuzzy:true', () => {
		expect(findRouteMatch('/yo/something', processedTree, true)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "*": "something",
			  },
			  "route": {
			    "fullPath": "/yo/$",
			    "id": "/yo/$",
			    "path": "$",
			  },
			}
		`)
	})
})
