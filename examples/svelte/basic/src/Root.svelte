<script lang="ts">
import {
  Outlet,
  Link,
} from '@tanstack/svelte-router'
</script>
<div>
  <Link to="/">Home</Link> <Link to="/about">About</Link>
</div>
<hr />
<Outlet />
