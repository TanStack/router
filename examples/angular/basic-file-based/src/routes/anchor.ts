import { Component } from '@angular/core'
import { createFileRoute, Link } from '@tanstack/angular-router-experimental'

export const Route = createFileRoute('/anchor')({
  component: () => AnchorComponent,
})

@Component({
  selector: 'route-component',
  standalone: true,
  template: `
    <div class="flex flex-col w-full">
      <nav class="sticky top-0 z-10 p-2 bg-gray-50 dark:bg-gray-900 border-b">
        <ul class="inline-flex gap-2">
          <li>
            <a [link]="{
              from: route.fullPath,
              hash: 'default-anchor',
              activeOptions: { includeHash: true },
              activeProps: { class: 'font-bold active' }
            }">Default Anchor</a>
          </li>
          <li>
            <a [link]="{
              from: route.fullPath,
              hash: 'false-anchor',
              hashScrollIntoView: false,
              activeOptions: { includeHash: true },
              activeProps: { class: 'font-bold active' }
            }">No Scroll Into View</a>
          </li>
          <li>
            <a [link]="{
              from: route.fullPath,
              hash: 'smooth-scroll',
              hashScrollIntoView: { behavior: 'smooth' },
              activeOptions: { includeHash: true },
              activeProps: { class: 'font-bold active' }
            }">Smooth Scroll</a>
          </li>
        </ul>
      </nav>
      <main class="overflow-auto">
        <div id="default-anchor" class="p-2 min-h-dvh">
          <h1 class="font-bold text-xl pt-10">Default Anchor</h1>
        </div>
        <div id="false-anchor" class="p-2 min-h-dvh">
          <h1 class="font-bold text-xl pt-10">No Scroll Into View</h1>
        </div>
        <div id="smooth-scroll" class="p-2 min-h-dvh">
          <h1 class="font-bold text-xl pt-10">Smooth Scroll</h1>
        </div>
      </main>
    </div>
  `,
  imports: [Link],
})
class AnchorComponent {
  route = Route
}
