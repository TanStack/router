import { useLoaderData } from '@tanstack/react-router';
export type PostType = {
  id: string;
  title: string;
  body: string;
};
function Post() {
  // const { post } = useLoaderData(routeConfig.id)

  // return (
  //   <div className="space-y-2">
  //     <h4 className="text-xl font-bold underline">{post.title}</h4>
  //     <div className="text-sm">{post.body}</div>
  //   </div>
  // )

  return 'Hello';
}
export const component = Post;