import { AppBar, Box, Toolbar, css, styled } from '@mui/material'
import { CustomLink } from './CustomLink'

const StyledRouterLink = styled(CustomLink)(
  ({ theme }) => css`
    color: ${theme.palette.common.white};
  `,
)

export function Header() {
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
