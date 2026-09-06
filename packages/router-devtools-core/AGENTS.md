# Router devtools

- Measure closed-panel setup and idle callbacks with large route/cache state as well as open-panel interactions. Development-only code still has a user-visible cost; distinguish default development exports from explicit production opt-ins.
- Count style-factory and template-processing work separately from inserted CSS. Before reusing styles, preserve document/shadow-root ownership, theme updates, HMR, and target disposal; stylesheet deduplication alone does not prove the construction work is absent.
- For React/Solid/Vue wrappers, replace router A with B while mounted, navigate each, then unmount and update again. Only the current router should drive the panel, and unmounted wrappers should receive no further work. Test floating and standalone wrappers when both are affected.
