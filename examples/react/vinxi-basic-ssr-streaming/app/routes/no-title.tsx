import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useTransition } from "react";

async function action() {
  "use server";
  console.log("hola from the server");
  return new Promise<string>((r) => {
    setTimeout(() => r("Server says hello, too!"), 500);
  });
}

export const Route = createFileRoute("/no-title")({
  component: NoTitle,
});

function NoTitle() {
  const [isHelloling, startHellling] = useTransition();
  const [hola, setHola] = useState("");
  useEffect(() => {
    action().then((h) => {
      setHola(h);
    });
  }, []);
  return (
    <div>
      {hola}
      <h1>Hello!</h1>
      <p>This page has no title.</p>
    </div>
  );
}
