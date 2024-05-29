'use server'

export function test() {
  // const posts = await fetchPosts()
  console.log('hello')

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[{ id: 'i-do-not-exist', title: 'Non-existent Post' }]?.map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              {post.title.substring(0, 20)}
              {/* <Link
                            to="/posts/$postId"
                            params={{
                              postId: post.id,
                            }}
                            className="block py-1 text-blue-800 hover:text-blue-600"
                            activeProps={{ className: 'text-black font-bold' }}
                          >
                            <div>{post.title.substring(0, 20)}</div>
                          </Link> */}
            </li>
          )
        })}
      </ul>
      <hr />
      {/* <Outlet /> */}
    </div>
  )
}
