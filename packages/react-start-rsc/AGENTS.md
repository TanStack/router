# React Start RSC

- Tests run in two tiers. `test:unit` (fast tier) runs the runtime's unit tests in jsdom. `test:integration` (slow tier) runs `tests/integration/**`: real Start apps with RSC on Vite and Rsbuild dev servers and builds, and real browser pages; its Nx target builds `@tanstack/react-start` first. Run both tiers before handing back.
- To run one test file or `-t` filter quickly, the slow-tier load gate and the test budgets: [compiler-test-utils/AGENTS.md](../compiler-test-utils/AGENTS.md).
