import { router } from '.'

export default function Expensive() {
  const match = router.useMatch()

  return <>Expensive Data: {JSON.stringify(match.data)}</>
}
