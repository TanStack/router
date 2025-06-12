import { Link } from '@tanstack/react-router'
import { styled } from 'styled-components'

const Layout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
`

const Content = styled.div`
  color: #4a5568; /* gray-600 */
  @media (prefers-color-scheme: dark) {
    color: #a0aec0; /* dark:text-gray-400 */
  }
`

const ButtonsRow = styled.p`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
`

const GoBackButton = styled.button`
  all: unset;

  cursor: pointer;
  background-color: #38a169; /* emerald-500 */
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem; /* rounded */
  text-transform: uppercase;
  font-weight: 900; /* font-black */
  font-size: 0.875rem; /* text-sm */
`

const StartOverLink = styled(Link)`
  all: unset;
  
  cursor: pointer;
  background-color: #00bcd4; /* cyan-600 */
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem; /* rounded */
  text-transform: uppercase;
  font-weight: 900; /* font-black */
  font-size: 0.875rem; /* text-sm */
`

export function NotFound({ children }: { children?: any }) {
  return (
    <Layout>
      <Content>
        {children || <p>The page you are looking for does not exist.</p>}
      </Content>
      <ButtonsRow>
        <GoBackButton onClick={() => window.history.back()}>
          Go back
        </GoBackButton>
        <StartOverLink to="/">Start Over</StartOverLink>
      </ButtonsRow>
    </Layout>
  )
}
