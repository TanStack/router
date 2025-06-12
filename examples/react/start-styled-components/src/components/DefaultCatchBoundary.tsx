import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { css, styled } from 'styled-components'

const Layout = styled.div`
  min-width: 0;
  flex: 1;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
`

const ButtonsRow = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
`

const buttonStyles = css`
  padding: 0.5rem 1rem;
  background-color: #4a5568; /* gray-600 */
  color: white;
  border-radius: 0.375rem; /* rounded */
  text-transform: uppercase;
  font-weight: 800; /* font-extrabold */
  cursor: pointer;

  &:hover {
    background-color: #2d3748; /* dark:bg-gray-700 */
  }
`

const TryAgainButton = styled.button`
  ${buttonStyles}
`

const StyledLink = styled(Link)`
  ${buttonStyles}
`

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  console.error('DefaultCatchBoundary Error:', error)

  return (
    <Layout>
      <ErrorComponent error={error} />
      <ButtonsRow>
        <TryAgainButton
          onClick={() => {
            router.invalidate()
          }}
        >
          Try Again
        </TryAgainButton>
        {isRoot ? (
          <StyledLink to="/">Home</StyledLink>
        ) : (
          <StyledLink
            to="/"
            onClick={(e) => {
              e.preventDefault()
              window.history.back()
            }}
          >
            Go Back
          </StyledLink>
        )}
      </ButtonsRow>
    </Layout>
  )
}
