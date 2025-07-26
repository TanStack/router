# How-To Guides Implementation Plan

This document outlines the multi-PR process for implementing the remaining how-to guides for TanStack Router.

## Progress Tracking

- ✅ **Guide #1: Deploy to Production** - COMPLETED in docs/router/framework/react/how-to/deploy-to-production.md
- ✅ **Guide #2: Setup SSR** - COMPLETED in docs/router/framework/react/how-to/setup-ssr.md
- ✅ **Guide #3: Migrate from React Router v7** - COMPLETED in docs/router/framework/react/how-to/migrate-from-react-router.md
- ⏳ **Guide #4: Fix Build Issues** - MOVED TO DEBUGGING DIRECTORY
- ✅ **Guide #5: Integrate UI Libraries** - COMPLETED (split into individual guides)
- ✅ **Guide #6: Setup Authentication** - COMPLETED (split into three focused guides)
- ✅ **Guide #7: Debug Router Issues** - COMPLETED
- ✅ **Guide #8: Setup Testing** - COMPLETED
- ✅ **Environment Variables: TanStack Router** - COMPLETED in docs/router/framework/react/how-to/use-environment-variables.md
- ✅ **Environment Variables: TanStack Start** - COMPLETED in docs/start/framework/react/how-to/use-environment-variables.md
- 🔄 **Progressive Search Params Series** - IN PLANNING

### 🔄 Progressive Search Params How-To Series (Replaces Guide #10)

**Status:** Ready for implementation with test verification

**Foundation Level (Start Here):**
- ✅ **Search #1: Setup Basic Search Parameters** (`setup-basic-search-params.md`) - COMPLETED with comprehensive tests
- ⏳ **Search #2: Navigate with Search Parameters** (`navigate-with-search-params.md`) - Test Gap: Functional updates, Link patterns

**Intermediate Level (Common Patterns):**
- ⏳ **Search #3: Validate Search Parameters with Schemas** (`validate-search-params.md`) - Test Coverage: Good (existing Zod tests)
- ⏳ **Search #4: Handle Complex Search Parameter Types** (`complex-search-param-types.md`) - Test Gap: Arrays, objects, dates
- ⏳ **Search #5: Share Search Parameters Across Routes** (`share-search-params-across-routes.md`) - Test Coverage: Partial (middleware tests exist)

**Advanced Level (Power User Patterns):**
- ⏳ **Search #6: Build Advanced Search Parameter Middleware** (`advanced-search-param-middleware.md`) - Test Coverage: Good (existing middleware tests)
- ⏳ **Search #7: Optimize Search Parameter Performance** (`optimize-search-param-performance.md`) - Test Gap: Performance patterns, selectors
- ⏳ **Search #8: Customize Search Parameter Serialization** (`customize-search-param-serialization.md`) - Test Gap: Custom serializers

**Specialized Use Cases:**
- ⏳ **Search #9: Build Search-Based Filtering Systems** (`build-search-filtering-systems.md`) - Test Gap: Complex filtering patterns
- ⏳ **Search #10: Handle Search Parameters in Forms** (`search-params-in-forms.md`) - Test Gap: Form integration patterns
- ⏳ **Search #11: Debug Search Parameter Issues** (`debug-search-param-issues.md`) - Test Coverage: Partial (debug tests exist)
- ⏳ **Search #12: Use Search Parameters with Data Loading** (`search-params-with-data-loading.md`) - Test Gap: Loader integration patterns

- ⏳ **Guide #9: Setup Dev Environment** - PENDING
- ⏳ **Guide #11: Advanced Routing Patterns** - PENDING

## Implementation Process

### For Each New How-To Guide:

1. **Create the guide** in `docs/router/framework/react/how-to/[guide-name].md`
2. **Follow the established structure:**
   - Quick Start section
   - Step-by-step platform/scenario-specific instructions
   - Production checklist (if applicable)
   - Common Problems section
   - Common Next Steps (commented out until guides exist)
   - Related Resources (specific links only)
3. **Create or verify test coverage** for documented patterns (see Test Verification section below)
4. **Update the directory README** to list the new guide
5. **Update this tracking document** to mark as completed
6. **Uncomment relevant "Common Next Steps"** in other guides that reference this one

### Multi-PR Guidelines:

- **One guide per PR** for focused reviews and easier iteration
- **Start with highest priority** guides (#4, #5, #6...)
- **Cross-reference between guides** as they become available
- **Update tracking status** in each PR

### Test Verification Requirements:

**CRITICAL:** Each how-to guide MUST be backed by working tests that verify the documented patterns actually work.

**Test Strategy:**
1. **Check existing test coverage first** - If patterns are already tested in `packages/*/tests/`, reference those tests
2. **Create focused unit tests** for undocumented patterns using the existing test structure
3. **Place tests in** `packages/react-router/tests/how-to-[guide-name].test.tsx`
4. **Follow existing test patterns** from `searchMiddleware.test.tsx`, `link.test.tsx`, etc.
5. **Test the exact code examples** shown in the guide to ensure they work

**Test Coverage Analysis:**
- ✅ **Good Coverage:** Schema validation (Zod tests), middleware (`searchMiddleware.test.tsx`), basic navigation
- ⚠️ **Partial Coverage:** Route inheritance patterns, debug scenarios
- ❌ **Missing Coverage:** Complex types (arrays/objects/dates), performance patterns, custom serialization, filtering systems, form integration, loader integration

**Test Requirements by Guide:**
- **Search #1 (Basic):** Create `how-to-basic-search-params.test.tsx` - Test basic `validateSearch` patterns, `useSearch()` hook
- **Search #2 (Navigation):** Create `how-to-navigate-search-params.test.tsx` - Test `<Link search />`, functional updates, `navigate()`
- **Search #3 (Validation):** Reference existing Zod adapter tests, add guide-specific examples if needed
- **Search #4 (Complex Types):** Create `how-to-complex-search-types.test.tsx` - Test arrays, objects, dates, enums
- **Search #5 (Cross-route):** Extend existing middleware tests with route inheritance patterns
- **Search #6 (Middleware):** Reference existing `searchMiddleware.test.tsx`, add advanced patterns
- **Search #7 (Performance):** Create `how-to-search-performance.test.tsx` - Test selectors, re-render optimization
- **Search #8 (Serialization):** Create `how-to-search-serialization.test.tsx` - Test custom parsers/serializers
- **Search #9 (Filtering):** Create `how-to-search-filtering.test.tsx` - Test complex filter combinations
- **Search #10 (Forms):** Create `how-to-search-forms.test.tsx` - Test form state synchronization
- **Search #11 (Debug):** Extend existing debug tests with guide-specific scenarios
- **Search #12 (Data Loading):** Create `how-to-search-loaders.test.tsx` - Test search params in loaders

**Test Development Process:**
1. **Write the guide first** with complete code examples
2. **Create corresponding tests** that verify every code example works
3. **Run tests** to ensure all examples are correct
4. **Fix any issues** in both guide and tests
5. **Document test file location** in the guide's "Testing" section

---

## Next Agent Tasks

### Priority 1: Guide #4 - How to Fix Common Build and Bundler Issues

**File:** `docs/router/framework/react/how-to/fix-build-issues.md`

**Context for Agent:**

- Check existing installation guides in `docs/router/framework/react/routing/` for bundler setup
- Focus on troubleshooting rather than initial setup
- Address type generation failures and module resolution errors

**Content Requirements:**

- Plugin setup for different bundlers (Vite, Webpack, ESBuild, Rspack)
- Fixing TypeScript route generation
- Resolving import/export errors
- Optimizing bundle size
- Common Problems: Type generation failures, build optimization, module resolution

---

### Priority 2: Guide #5 - How to Integrate with Popular UI Libraries

**File:** `docs/router/framework/react/how-to/integrate-ui-libraries.md`

**Context for Agent:**

- GitHub Issue #939 shows Shadcn/ui animation conflicts
- Focus on most popular libraries with known integration challenges

**Content Requirements:**

- Shadcn/ui integration and animation fixes
- Material-UI/MUI setup
- Chakra UI integration
- Framer Motion compatibility
- Common Problems: Animation conflicts, CSS-in-JS compatibility, styling issues

---

### Priority 3: Guide #6 - How to Set Up Authentication and Protected Routes

**File:** `docs/router/framework/react/how-to/setup-authentication.md`

**Context for Agent:**

- Reference existing guide: `docs/router/framework/react/guide/authenticated-routes.md`
- Create practical, step-by-step version focused on implementation
- Include popular auth provider integrations

**Content Requirements:**

- Setting up route context for auth
- Creating auth-protected route patterns
- Implementing login redirects
- Handling auth state persistence
- Integration with popular auth providers (Auth0, Clerk, Supabase)
- Common Problems: Auth state management, redirect loops, persistence issues

---

### Remaining Guides (Priority 6-11):

**Priority 6:** Debug Common Router Issues (`debug-router-issues.md`)
**Priority 7:** Set Up Testing (`setup-testing.md`)  
**Priority 8:** Set Up Development Environment (`setup-dev-environment.md`)
**Priority 9:** Handle Search Parameters and URL State (`handle-search-parameters.md`)
**Priority 10:** Implement Advanced Routing Patterns (`advanced-routing-patterns.md`)

---

## Agent Instructions Template

When implementing each guide, use this template for your agent task:

```
Create a comprehensive how-to guide for [GUIDE_TITLE] following the established pattern:

1. **Read the priority document** at how-to-guides-implementation-plan.md for context
2. **Check existing documentation** mentioned in the Context section
3. **Follow the structure** from deploy-to-production.md:
   - Quick Start
   - Platform/scenario-specific instructions
   - Production checklist (if applicable)
   - Common Problems
   - Common Next Steps (commented out)
   - Related Resources (specific only)
4. **Update the README** at docs/router/framework/react/how-to/README.md
5. **Update tracking** in how-to-guides-implementation-plan.md
6. **Cross-reference existing guides** by uncommenting relevant "Common Next Steps"

Focus on practical, copy-paste ready solutions that solve real developer pain points.
```

---

## Quality Checklist

Before marking any guide as complete:

- [ ] Follows established structure pattern
- [ ] Includes working code examples
- [ ] Addresses real GitHub issues/pain points
- [ ] Common Problems section covers frequent issues
- [ ] No broken links (all "Common Next Steps" commented out until guides exist)
- [ ] Related Resources are specific and valuable
- [ ] README updated with new guide
- [ ] Cross-references added to other guides where appropriate

---

## Completion Tracking

Update this section as guides are completed:

```
✅ Guide #1: Deploy to Production - COMPLETED
✅ Guide #2: Setup SSR - COMPLETED
✅ Guide #3: Migrate from React Router - COMPLETED
⏳ Guide #4: Fix Build Issues - MOVED TO DEBUGGING DIRECTORY
✅ Guide #5: Integrate UI Libraries - COMPLETED (split into individual guides)
  ✅ Shadcn/ui Integration - COMPLETED
  ✅ Material-UI Integration - COMPLETED
  ✅ Framer Motion Integration - COMPLETED
  ✅ Chakra UI Integration - COMPLETED
✅ Guide #6: Setup Authentication - COMPLETED (split into three focused guides)
  ✅ Basic Authentication Setup - COMPLETED
  ✅ Authentication Providers Integration - COMPLETED
  ✅ Role-Based Access Control - COMPLETED
✅ Guide #7: Debug Router Issues - COMPLETED
✅ Guide #8: Setup Testing - COMPLETED
⏳ Guide #9: Setup Dev Environment - PENDING
⏳ Guide #10: Handle Search Parameters - PENDING
⏳ Guide #11: Advanced Routing Patterns - PENDING
```

This systematic approach ensures consistent quality and enables incremental progress across multiple agent sessions.
