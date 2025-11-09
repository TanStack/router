import { describe, expect, it } from 'vitest'
import { findMatch, processRouteTree } from "../src/new-process-route-tree"


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
			}
		]
	}

	const { segmentTree } =
		processRouteTree({ routeTree: testTree })

	it('works w/ optional params when param is present', () => {
		expect(findMatch('/yo/foo123bar/ma', segmentTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "id": "123",
			  },
			  "routeId": "/yo/foo{-$id}bar/ma",
			}
		`)
	})
	it('works w/ optional params when param is absent', () => {
		expect(findMatch('/yo/ma', segmentTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "id": "",
			  },
			  "routeId": "/yo/foo{-$id}bar/ma",
			}
		`)
	})
	it('works w/ wildcard and suffix', () => {
		expect(findMatch('/yo/somefile.png', segmentTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "*": "somefile",
			  },
			  "routeId": "/yo/{$}.png",
			}
		`)
	})
	it('works w/ wildcard alone', () => {
		expect(findMatch('/yo/something', segmentTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "*": "something",
			  },
			  "routeId": "/yo/$",
			}
		`)
	})
	it('works w/ multiple required param routes at same level, w/ different names for their param', () => {
		expect(findMatch('/foo/123/aaa', segmentTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "a": "123",
			  },
			  "routeId": "/foo/$a/aaa",
			}
		`)
		expect(findMatch('/foo/123/bbb', segmentTree)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "b": "123",
			  },
			  "routeId": "/foo/$b/bbb",
			}
		`)
	})

	it('works w/ fuzzy matching', () => {
		expect(findMatch('/foo/123', segmentTree, true)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "**": "/123",
			  },
			  "routeId": "/foo",
			}
		`)
	})
	it('can still return exact matches w/ fuzzy:true', () => {
		expect(findMatch('/yo/foobar', segmentTree, true)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "id": "",
			  },
			  "routeId": "/yo/foo{-$id}bar",
			}
		`)
	})
	it('can still match a wildcard route w/ fuzzy:true', () => {
		expect(findMatch('/yo/something', segmentTree, true)).toMatchInlineSnapshot(`
			{
			  "params": {
			    "*": "something",
			  },
			  "routeId": "/yo/$",
			}
		`)
	})
})
