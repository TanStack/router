import * as React from 'react'
import { Await, createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute("/hello")({
  component: Hello,
});

function Hello() {
  const { data, slowData } = Route.useLoaderData();

  return (
    <div className="p-2">
      <p>Hello from the client!</p>
      <p>{data}</p>
      <React.Suspense fallback={<p>Loading...</p>}>
        <Await promise={slowData}>{(slowData) => <p>{slowData}</p>}</Await>
      </React.Suspense>
    </div>
  );
}
