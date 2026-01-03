import { Component } from '@angular/core';
import { createLazyRoute } from '@tanstack/angular-router';

@Component({
  selector: 'app-expensive',
  standalone: true,
  template: `
    <div class="p-2">
      I am an "expensive" component... which really just means that I was code-split 😉
    </div>
  `,
})
class ExpensiveComponent {}

export const Route = createLazyRoute('/expensive')({
  component: () => ExpensiveComponent,
});
