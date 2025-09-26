import { createFileRoute } from "@tanstack/react-router";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { createServerFn } from "@tanstack/react-start";

const getServerMessage = createServerFn()
  .inputValidator((emoji: string) => emoji)
  .handler((ctx) => {
    return m.server_message({ emoji: ctx.data });
  });

export const Route = createFileRoute("/")({
  component: Home,
  loader: () => {
    return {
      localeFromLoader: getLocale(),
      messageFromLoader: m.example_message({ username: "John Doe" }),
      serverFunctionMessage: getServerMessage({ data: "📩" }),
    };
  },
});

function Home() {
  const { serverFunctionMessage, messageFromLoader, localeFromLoader } =
    Route.useLoaderData();
  return (
    <div className="p-2">
      <h2>Message from loader: {messageFromLoader}</h2>
      <h2>Server function message: {serverFunctionMessage}:</h2>
      <h3>{m.example_message({ username: "John Doe" })}</h3>
    </div>
  );
}
