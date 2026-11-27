/** Route HMR of a binding the route module keeps and a chunk reads, on Rsbuild, Solid; shared rows. */
import {
  keptBindingHotUpdatesSuite,
  keptBindingSuite,
} from './route-hmr-browser-kept-binding-cases'

keptBindingSuite('rsbuild', 'solid')
keptBindingHotUpdatesSuite()
