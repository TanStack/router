export function getRequiredLink(container: ParentNode, testId: string) {
  const link = container.querySelector<HTMLAnchorElement>(
    `[data-testid="${testId}"]`,
  )
  if (!link) {
    throw new Error(`Unable to find benchmark link: ${testId}`)
  }

  return link
}

export async function waitForRequiredLink(
  container: ParentNode,
  testId: string,
) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const link = container.querySelector<HTMLAnchorElement>(
      `[data-testid="${testId}"]`,
    )

    if (link) {
      return link
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }

  return getRequiredLink(container, testId)
}
