/**
  This helper function generates the array of messages
  that we'll stream to the client.
*/
function generateMessages() {
  const messages = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 100),
  ).map((n, i) =>
    textPartSchema.parse({
      choices: [
        {
          delta: { content: `Number #${i + 1}: ${n}\n` },
          index: i,
          finish_reason: null,
        },
      ],
    }),
  )
  return messages
}

/**
  This helper function is used to simulate the
  delay between each message being sent.
*/
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
