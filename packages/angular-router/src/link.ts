import {
  afterRenderEffect,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  AnyRouter,
  Constrain,
  deepEqual,
  exactPathTest,
  InferFrom,
  InferMaskFrom,
  InferMaskTo,
  InferTo,
  LinkOptions,
  preloadWarning,
  RegisteredRouter,
  removeTrailingSlash,
} from '@tanstack/router-core';
import { combineLatest, map } from 'rxjs';
import { distinctUntilRefChanged } from './distinct-until-ref-changed';
import { matches$ } from './matches';
import { injectRouter } from './router';
import { routerState, routerState$ } from './router-state';

@Directive({
  selector: 'a[link]',
  exportAs: 'link',
  host: {
    '(click)': 'handleClick($event)',
    '(focus)': 'handleFocus()',
    '(touchstart)': 'handleClick($event)',
    '(mouseenter)': 'handleMouseEnter($event)',
    '(mouseleave)': 'handleMouseLeave()',
    '[class]': 'activeClass()',
    '[attr.data-active]': 'isActive()',
    '[attr.data-type]': 'type()',
    '[attr.data-transitioning]':
      'transitioning() ? "transitioning" : undefined',
    '[attr.href]': 'hostHref()',
    '[attr.role]': 'disabled() ? "link" : undefined',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.aria-current]': 'isActive() ? "page" : undefined',
    '[attr.data-from]': 'from()',
  },
})
export class Link {
  linkOptions = input.required({
    alias: 'link',
    transform: (
      value:
        | (Omit<LinkOptions, 'activeOptions'> & {
            activeOptions?: LinkOptions['activeOptions'] & { class?: string };
          })
        | NonNullable<LinkOptions['to']>
    ) => {
      return (typeof value === 'object' ? value : { to: value }) as Omit<
        LinkOptions,
        'activeOptions'
      > & { activeOptions?: LinkOptions['activeOptions'] & { class?: string } };
    },
  });
  linkActiveOptions = input(
    { class: 'active' },
    {
      alias: 'linkActive',
      transform: (
        value: (LinkOptions['activeOptions'] & { class?: string }) | string
      ) => {
        if (typeof value === 'string') return { class: value };

        if (!value.class) value.class = 'active';
        return value;
      },
    }
  );

  private router = injectRouter();
  hostElement = inject<ElementRef<HTMLAnchorElement>>(ElementRef);

  private currentSearch = routerState({ select: (s) => s.location.searchStr });

  protected disabled = computed(() => this.linkOptions()['disabled']);
  private to = computed(() => this.linkOptions()['to']);
  private userFrom = computed(() => this.linkOptions()['from']);
  private userReloadDocument = computed(
    () => this.linkOptions()['reloadDocument']
  );
  private userPreload = computed(() => this.linkOptions()['preload']);
  private userPreloadDelay = computed(() => this.linkOptions()['preloadDelay']);

  private activeOptions = computed(
    () => this.linkOptions().activeOptions || this.linkActiveOptions() || {}
  );
  private exactActiveOptions = computed(() => this.activeOptions().exact);
  private includeHashActiveOptions = computed(
    () => this.activeOptions().includeHash
  );
  private includeSearchActiveOptions = computed(
    () => this.activeOptions().includeSearch
  );

  protected type = computed(() => {
    const to = this.to();
    try {
      new URL(`${to}`);
      return 'external';
    } catch {
      return 'internal';
    }
  });

  // when `from` is not supplied, use the leaf route of the current matches as the `from` location
  // so relative routing works as expected
  protected from = toSignal(
    combineLatest([
      toObservable(this.userFrom),
      matches$({ select: (matches) => matches[matches.length - 1]?.fullPath }),
    ]).pipe(
      map(([userFrom, from]) => userFrom ?? from),
      distinctUntilRefChanged()
    )
  );

  private navigateOptions = computed(() => {
    return { ...this.linkOptions(), from: this.from() };
  });

  private next = computed(() => {
    const [options] = [this.navigateOptions(), this.currentSearch()];
    try {
      return this.router.buildLocation(options as any);
    } catch (err) {
      return null;
    }
  });

  private preload = computed(() => {
    const userReloadDocument = this.userReloadDocument();
    if (userReloadDocument) return false;
    const userPreload = this.userPreload();
    if (userPreload) return userPreload;
    return this.router.options.defaultPreload;
  });

  private preloadDelay = computed(() => {
    const userPreloadDelay = this.userPreloadDelay();
    if (userPreloadDelay) return userPreloadDelay;
    return this.router.options.defaultPreloadDelay;
  });

  protected hostHref = computed(() => {
    const [type, to] = [this.type(), this.to()];
    if (type === 'external') return to;

    const disabled = this.disabled();
    if (disabled) return undefined;

    const next = this.next();
    if (!next) return undefined;

    return next.maskedLocation
      ? this.router.history.createHref(next.maskedLocation.href)
      : this.router.history.createHref(next.href);
  });

  transitioning = signal(false);

  isActive = toSignal(
    combineLatest([
      toObservable(this.next),
      toObservable(this.exactActiveOptions),
      toObservable(this.includeSearchActiveOptions),
      toObservable(this.includeHashActiveOptions),
      routerState$({ select: (s) => s.location }),
    ]).pipe(
      map(
        ([next, exact, includeSearchOptions, includeHashOptions, location]) => {
          if (!next) return false;
          if (exact) {
            const testExact = exactPathTest(
              location.pathname,
              next.pathname,
              this.router.basepath
            );
            if (!testExact) return false;
          } else {
            const currentPathSplit = removeTrailingSlash(
              location.pathname,
              this.router.basepath
            ).split('/');
            const nextPathSplit = removeTrailingSlash(
              next.pathname,
              this.router.basepath
            ).split('/');
            const pathIsFuzzyEqual = nextPathSplit.every(
              (d, i) => d === currentPathSplit[i]
            );
            if (!pathIsFuzzyEqual) {
              return false;
            }
          }

          const includeSearch = includeSearchOptions ?? true;
          if (includeSearch) {
            const searchTest = deepEqual(location.search, next.search, {
              partial: !exact,
              ignoreUndefined: !(includeSearchOptions ?? true),
            });
            if (!searchTest) {
              return false;
            }
          }

          const includeHash = includeHashOptions ?? true;
          if (includeHash) {
            return location.hash === next.hash;
          }

          return true;
        }
      )
    )
  );
  protected activeClass = computed(() =>
    this.isActive() ? this.activeOptions().class || 'active' : ''
  );

  constructor() {
    afterRenderEffect(() => {
      const [disabled, preload] = [
        untracked(this.disabled),
        untracked(this.preload),
      ];
      if (!disabled && preload === 'render') {
        this.doPreload();
      }
    });

    afterRenderEffect((onCleanup) => {
      const unsub = this.router.subscribe('onResolved', () => {
        this.transitioning.set(false);
      });
      onCleanup(() => unsub());
    });
  }

  protected handleClick(event: MouseEvent) {
    if (this.type() === 'external') return;

    const [disabled, target] = [
      this.disabled(),
      this.hostElement.nativeElement.target,
    ];

    if (
      disabled ||
      this.isCtrlEvent(event) ||
      event.defaultPrevented ||
      (target && target !== '_self') ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    this.transitioning.set(true);

    this.router.navigate(this.navigateOptions() as any);
  }

  protected handleFocus() {
    if (this.disabled() || this.type() === 'external') return;
    if (this.preload()) {
      this.doPreload();
    }
  }

  private preloadTimeout: ReturnType<typeof setTimeout> | null = null;
  protected handleMouseEnter(event: MouseEvent) {
    if (
      this.disabled() ||
      !this.preload() ||
      this.isActive() ||
      this.type() === 'external'
    )
      return;

    this.preloadTimeout = setTimeout(() => {
      this.preloadTimeout = null;
      this.doPreload();
    }, this.preloadDelay());
  }

  protected handleMouseLeave() {
    if (this.disabled() || this.type() === 'external') return;
    if (this.preloadTimeout) {
      clearTimeout(this.preloadTimeout);
      this.preloadTimeout = null;
    }
  }

  private doPreload() {
    this.router.preloadRoute(this.navigateOptions() as any).catch((err) => {
      console.warn(err);
      console.warn(preloadWarning);
    });
  }

  private isCtrlEvent(e: MouseEvent) {
    return e.metaKey || e.altKey || e.ctrlKey || e.shiftKey;
  }
}

export type ValidateLinkOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TOptions = unknown,
  TDefaultFrom extends string = string,
> = Constrain<
  TOptions,
  Omit<
    LinkOptions<
      TRouter,
      InferFrom<TOptions, TDefaultFrom>,
      InferTo<TOptions>,
      InferMaskFrom<TOptions>,
      InferMaskTo<TOptions>
    >,
    'activeOptions'
  > &
    Partial<Omit<HTMLAnchorElement, 'search'>> & {
      label?: string | (() => string);
      activeOptions?: LinkOptions<
        TRouter,
        InferFrom<TOptions, TDefaultFrom>,
        InferTo<TOptions>,
        InferMaskFrom<TOptions>,
        InferMaskTo<TOptions>
      >['activeOptions'] & { class?: string };
    }
>;

export type ValidateLinkOptionsArray<
  TRouter extends AnyRouter = RegisteredRouter,
  TOptions extends ReadonlyArray<any> = ReadonlyArray<unknown>,
  TDefaultFrom extends string = string,
> = {
  [K in keyof TOptions]: ValidateLinkOptions<
    TRouter,
    TOptions[K],
    TDefaultFrom
  >;
};

export type LinkOptionsFnOptions<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> =
  TOptions extends ReadonlyArray<any>
    ? ValidateLinkOptionsArray<TRouter, TOptions>
    : ValidateLinkOptions<TRouter, TOptions>;

export type LinkOptionsFn = <
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(
  options: LinkOptionsFnOptions<TOptions, TRouter>
) => TOptions;

export const linkOptions: LinkOptionsFn = (options) => {
  return options as any;
};
