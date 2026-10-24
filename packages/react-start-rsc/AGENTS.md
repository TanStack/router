# React Start RSC

- Tests run in two tiers. `test:unit` is reserved for fast compiler acceptance (currently empty). `test:noncompiler` runs main's RSC runtime and type tests (57 tests, at main's paths in `tests/`, listed in `tests/noncompiler-tests.json`, unchanged from main) in jsdom; `test:types` and `test:eslint` check `tests/integration/` only, as main does not type-check or lint them. `test:integration` (slow tier) runs `tests/integration/**`: real Start apps with RSC on Vite and Rsbuild dev servers and builds, and real browser pages; its Nx target builds `@tanstack/react-start` first. Run integration, noncompiler, types and eslint before handing back.
- To run one test file or `-t` filter quickly, the slow-tier load gate and the test budgets: [compiler-test-utils/AGENTS.md](../compiler-test-utils/AGENTS.md).
- What these tests are, the spec they cite (`J4.12`, `G3`, `§5.7`) and the known bugs: [compiler-test-utils/oracle/README.md](../compiler-test-utils/oracle/README.md).
