import { createFileRoute } from "@tanstack/react-router";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  return (
    <div>
      <p>
        {m.example_message({
          username: "TanStack Router!",
        })}
      </p>
    </div>
  );
}
