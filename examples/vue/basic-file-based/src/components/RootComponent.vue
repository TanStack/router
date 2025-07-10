<template>
  <div>
    <HeadContent />
    <div class="p-2 flex gap-2 text-lg border-b">
      <Link
        to="/"
        :active-props="{
          class: 'font-bold',
        }"
        :active-options="{ exact: true }"
      >
        Home
      </Link>
      {{ ' ' }}
      <Link
        to="/posts"
        :active-props="{
          class: 'font-bold',
        }"
      >
        Posts
      </Link>
      {{ ' ' }}
      <Link
        to="/route-a"
        :active-props="{
          class: 'font-bold',
        }"
      >
        Pathless Layout
      </Link>
      {{ ' ' }}
      <Link
        to="/this-route-does-not-exist"
        :active-props="{
          class: 'font-bold',
        }"
      >
        This Route Does Not Exist
      </Link>
    </div>
    <hr>
    <Outlet />
    <!-- Start rendering router matches -->
    <TanStackRouterDevtools
      :router="router"
      position="bottom-right"
    />
  </div>
</template>

<script setup lang="ts">
import {
  HeadContent,
  Link,
  Outlet,
  useRouter,
} from '@tanstack/vue-router'
import { TanStackRouterDevtools } from '@tanstack/vue-router-devtools'

const router = useRouter()
</script> 