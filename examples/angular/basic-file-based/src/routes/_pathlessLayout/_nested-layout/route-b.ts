import { Component } from '@angular/core'
import { createFileRoute } from '@tanstack/angular-router-experimental'

export const Route = createFileRoute('/_pathlessLayout/_nested-layout/route-b')({
  component: () => RouteBComponent,
})

@Component({
  selector: 'route-component',
  standalone: true,
  template: `<div>I'm layout B!</div>`,
})
class RouteBComponent {}
