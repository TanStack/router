<script setup lang="ts">
import { Link, Outlet } from '@tanstack/vue-router'
</script>

<template>
  <div class="p-2 flex gap-2 text-lg border-b">
    <Link
      to="/"
      :activeProps="{ class: 'font-bold' }"
      :activeOptions="{ exact: true }"
    >
      Home
    </Link>
    <Link
      to="/posts"
      :activeProps="{ class: 'font-bold' }"
    >
      Posts
    </Link>
    <Link
      to="/layout-a"
      :activeProps="{ class: 'font-bold' }"
    >
      Layout
    </Link>
    <Link
      to="/this-route-does-not-exist"
      :activeProps="{ class: 'font-bold' }"
    >
      This Route Does Not Exist
    </Link>
  </div>
  <Outlet />
</template>
