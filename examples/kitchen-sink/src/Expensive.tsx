import { useMatch } from 'react-location'

export default function Expensive() {
  const match = useMatch()

  return <>Expensive Data: {JSON.stringify(match.data)}</>
}
