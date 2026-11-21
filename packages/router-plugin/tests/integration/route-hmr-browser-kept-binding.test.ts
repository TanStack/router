/** Route HMR of a binding the route module keeps and a chunk reads, on Rsbuild; shared rows. */
import {
  keptBindingHotUpdatesSuite,
  keptBindingSuite,
} from './route-hmr-browser-kept-binding-cases'

keptBindingSuite('rsbuild')
keptBindingHotUpdatesSuite()
