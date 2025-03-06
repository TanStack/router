import { AppBar, Box, Toolbar, css, styled } from '@mui/material'
import RouterLink from '~/components/RouterLink'

const StyledRouterLink = styled(RouterLink)(
  ({ theme }) => css`
    color: ${theme.palette.common.white};
  `,
)

export default function Header() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <StyledRouterLink to="/">Index</StyledRouterLink>
          <StyledRouterLink to="/about">About</StyledRouterLink>
        </Toolbar>
      </AppBar>
    </Box>
  )
}
