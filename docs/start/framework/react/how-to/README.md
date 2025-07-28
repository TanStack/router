# How-To Guides for TanStack Start

This directory contains focused, step-by-step instructions for common TanStack Start tasks. Each guide is designed to be:

- **Task-focused**: Covers one specific goal from start to finish
- **Self-contained**: All necessary steps included, no prerequisites assumed
- **Copy-paste ready**: Working code examples you can use immediately
- **Problem-solving oriented**: Addresses real-world scenarios and common issues

## **Implementation Plan - Sorted by First-Principles & Dependencies**

*Based on GitHub issues analysis and actual user pain points from the TanStack/router repository*

---

### **Foundation Layer (Prerequisites for everything else)**

### **1. How to Write Isomorphic, Client-Only, and Server-Only Code**
**Priority: Foundation** | **Dependencies: None** | **Status: 📝 Needed**

Core concept that affects every subsequent pattern in TanStack Start.

**Should Cover:**
- Understanding the execution boundary (server vs client)
- Code organization strategies for different execution contexts
- Common pitfalls and debugging techniques
- When to use each pattern

### **2. How to Create Basic Server Functions**
**Priority: Foundation** | **Dependencies: #1** | **Status: 📝 Needed**

**GitHub Issues:** [#4533](https://github.com/TanStack/router/issues/4533) (TypeScript issues)

Core server function concepts before advanced patterns.

**Should Cover:**
- `createServerFn()` basic setup and usage
- Input validation with validators (Zod, Valibot)
- Return types and serialization
- Error handling patterns
- Basic HTTP methods (GET, POST)
- Calling server functions from client components

### **3. How to Debug Server Function TypeScript Issues**
**Priority: Critical** | **Dependencies: #2** | **Status: 🔥 Urgent**

**GitHub Issues:** [#4533](https://github.com/TanStack/router/issues/4533) (5 👍)

**Should Cover:**
- Common TypeScript errors with server functions
- "Type instantiation is excessively deep" solutions
- Recursive type issues and workarounds
- Complex type inference debugging
- Performance optimization for TypeScript

---

### **Server Function Advanced Patterns**

### **4. How to Use Server Function Middleware**
**Priority: Foundation** | **Dependencies: #2** | **Status: 📝 Needed**

**GitHub Issues:** [#4737](https://github.com/TanStack/router/issues/4737), [#4738](https://github.com/TanStack/router/issues/4738), [#4460](https://github.com/TanStack/router/issues/4460)

**Should Cover:**
- `createMiddleware()` setup and patterns
- Proper `next()` calling patterns (avoid multiple calls)
- Composing multiple middleware functions
- Authentication middleware patterns
- Logging and observability middleware
- Error handling middleware
- Conditional middleware application

### **5. How to Handle Redirects in Server Functions**
**Priority: High** | **Dependencies: #4** | **Status: 🔥 Urgent**

**GitHub Issues:** [#4460](https://github.com/TanStack/router/issues/4460) (5 👍)

**Should Cover:**
- Redirect patterns with and without middleware
- Why redirects fail with middleware
- Proper response handling
- Authentication redirect patterns
- Common redirect failures and solutions

### **6. How to Manage Server Function Context**
**Priority: Core** | **Dependencies: #4** | **Status: 📝 Needed**

**Should Cover:**
- Context creation and typing
- Passing context between middleware layers
- Request context (headers, cookies, user info)
- Database connections in context
- Context inheritance patterns
- Performance considerations

### **7. How to Use sendContext for Server-Client Communication**
**Priority: Core** | **Dependencies: #6** | **Status: 📝 Needed**

**Should Cover:**
- `sendContext` API usage and patterns
- Serialization considerations
- Client-side context consumption
- Type safety with context transfer
- Performance optimization
- Use cases and best practices

---

### **Deployment & Hosting Layer (Major User Pain Points)**

### **8. How to Deploy to Cloudflare Pages/Workers (Comprehensive)**
**Priority: Critical** | **Dependencies: #2** | **Status: 🔥 Urgent**

**GitHub Issues:** [#4473](https://github.com/TanStack/router/issues/4473) (13 👍), [#4400](https://github.com/TanStack/router/issues/4400)

**Should Cover:**
- Cloudflare Pages deployment setup
- Cloudflare Workers configuration
- `@cloudflare/vite-plugin` integration
- Wrangler.toml configuration (best practices)
- Post-vinxi→vite migration fixes
- Virtual imports (`cloudflare:workflows`, `cloudflare:workers`)
- Environment variable management
- Custom Nitro configuration for Cloudflare
- **Note:** Some plugin configuration issues (#4779) are upstream dependencies

### **9. How to Deploy to Netlify**
**Priority: High** | **Dependencies: #2** | **Status: 📝 Needed**

**Partnership Focus:** Netlify (official hosting partner)

**Should Cover:**
- Netlify-specific configuration
- Edge functions integration
- Environment variables
- Build optimization
- Server function deployment on Netlify

### **10. How to Deploy to Netlify with Clerk Integration**
**Priority: High** | **Dependencies: #9** | **Status: 📝 Needed**

**GitHub Issues:** [#4762](https://github.com/TanStack/router/issues/4762)

**Should Cover:**
- Netlify + Clerk webhook setup
- Authentication flow on Netlify
- Environment variable management
- Edge function auth patterns
- Troubleshooting common issues

### **11. How to Deploy to Vercel**
**Priority: Medium-High** | **Dependencies: #2** | **Status: 📝 Needed**

**Should Cover:**
- Vercel Edge Functions
- Serverless function optimization
- Build configuration
- Performance monitoring

---

### **Advanced Configuration & Troubleshooting**

### **12. How to Configure Custom Nitro Settings**
**Priority: Medium-High** | **Dependencies: #8** | **Status: 📝 Needed**

**GitHub Issues:** [#4404](https://github.com/TanStack/router/issues/4404) (3 👍)

**Should Cover:**
- Post-vinxi→vite migration Nitro configuration
- Custom deployment target settings
- Advanced Nitro options for different platforms
- Migration troubleshooting from old configs
- `tanstackStart({ nitro: { ... } })` patterns

### **13. How to Handle Deferred Data and Streaming**
**Priority: High** | **Dependencies: #2** | **Status: 📝 Needed**

**GitHub Issues:** [#4802](https://github.com/TanStack/router/issues/4802)

**Should Cover:**
- Deferred data patterns in Start
- Server vs client promise resolution
- Page refresh behavior with deferred data
- Streaming best practices
- `useSuspenseQuery` with server functions
- Dynamic streaming without configuration

### **14. How to Handle URL Parameters and Encoding**
**Priority: Medium-High** | **Dependencies: #1** | **Status: 📝 Needed**

**GitHub Issues:** [#4514](https://github.com/TanStack/router/issues/4514)

**Should Cover:**
- Encoded URL parameter handling
- Preventing redirect loops on page refresh
- Complex parameter validation
- URL encoding best practices
- Client vs server parameter handling

### **15. How to Configure Project Structure and srcDirectory**
**Priority: Medium** | **Dependencies: #1** | **Status: 📝 Needed**

**GitHub Issues:** [#4432](https://github.com/TanStack/router/issues/4432)

**Should Cover:**
- srcDirectory configuration options
- Root directory setup patterns
- Avoiding "Invalid lazy handler" errors
- Project structure best practices
- File organization strategies

---

### **Server Infrastructure Layer**

### **16. How to Create and Configure Server Routes**
**Priority: Core** | **Dependencies: #2** | **Status: 📝 Needed**

**Should Cover:**
- Server route file conventions
- HTTP method handling with server functions
- Route parameters and server function integration
- Middleware integration with server routes
- Error handling patterns

### **17. How to Implement Single Flight Mutations with TanStack Query**
**Priority: Medium-High** | **Dependencies: #2, #7** | **Status: 📝 Needed**

**Advanced Pattern:** Server function + TanStack Query optimization

**Should Cover:**
- Single flight mutation patterns
- Server function integration with TanStack Query
- Optimistic updates with server functions
- Error handling and rollback strategies
- Performance optimization techniques
- Cache invalidation patterns

---

### **Database & Partnership Integrations**

### **18. How to Set Up TanStack DB with Start**
**Priority: High** | **Dependencies: #6, #7** | **Status: 📝 Needed**

**TanStack Ecosystem Integration**

**Should Cover:**
- TanStack DB setup and configuration
- Database context in server functions
- Type-safe database operations
- Migration patterns with Start
- Real-time features integration
- Performance optimization patterns

### **19. How to Set Up Neon Database Integration**
**Priority: High** | **Dependencies: #6** | **Status: 📝 Needed**

**Partnership Focus:** Neon (sponsor)

**Should Cover:**
- Neon setup with server function context
- Connection pooling in middleware
- Serverless-optimized patterns
- Environment management
- Migration workflows

### **20. How to Integrate with Convex**
**Priority: High** | **Dependencies: #6, #13** | **Status: 📝 Needed**

**Partnership Focus:** Convex (sponsor) + Real-time

**Should Cover:**
- Convex integration with server functions
- Real-time data with sendContext
- Authentication integration patterns
- Convex mutations vs server functions
- Performance optimization

---

### **Server Framework Integrations**

### **21. How to Integrate tRPC with TanStack Start**
**Priority: High** | **Dependencies: #16** | **Status: 📝 Needed**

**Should Cover:**
- tRPC router setup in server routes
- tRPC vs server functions comparison
- Hybrid patterns (when to use each)
- Authentication middleware with tRPC
- Type-safe client integration

### **22. How to Use Hono with TanStack Start**
**Priority: Medium-High** | **Dependencies: #16** | **Status: 📝 Needed**

**Should Cover:**
- Hono app integration in server routes
- Hono middleware vs Start middleware
- Performance optimizations
- Edge runtime compatibility

---

### **Authentication & Authorization**

### **23. How to Implement Full-Stack Authentication (Comprehensive)**
**Priority: Core** | **Dependencies: #4, #6** | **Status: 📝 Needed**

**Should Cover:**
- **HTTP-Only Cookie Sessions** with server function middleware
- **JWT Patterns** using context management
- **Session Management APIs** with TanStack Start
- **Route Protection** using middleware patterns
- **Auth Context** management across server functions
- **Login/Logout flows** with server function patterns

### **24. How to Integrate with Clerk Authentication**
**Priority: Core** | **Dependencies: #23** | **Status: 📝 Needed**

**Partnership Focus:** Clerk integration

**Should Cover:**
- Clerk middleware for server functions
- Authentication context with Clerk
- Protected server function patterns
- User management through server functions

### **25. How to Integrate with Better Auth**
**Priority: Medium** | **Dependencies: #23** | **Status: 📝 Needed**

**Emerging Auth Solution**

**Should Cover:**
- Better Auth setup and configuration
- Integration with Start's server functions
- Session management patterns
- Social login integration

---

## **Implementation Priority & Timeline**

### **Phase 1: Critical Foundation (Immediate - 4 weeks)**
1. **#1** - Isomorphic/Client/Server Code Boundaries
2. **#2** - Basic Server Functions  
3. **#3** - Debug Server Function TypeScript Issues 🔥
4. **#4** - Server Function Middleware
5. **#5** - Handle Redirects in Server Functions 🔥

### **Phase 2: Deployment Blockers (6 weeks)**
6. **#8** - Cloudflare Deployment (Comprehensive) 🔥
7. **#9** - Netlify Deployment
8. **#10** - Netlify + Clerk Integration
9. **#12** - Custom Nitro Configuration

### **Phase 3: Advanced Server Patterns (8 weeks)**
10. **#6** - Server Function Context Management
11. **#7** - sendContext Usage
12. **#13** - Deferred Data and Streaming
13. **#16** - Server Routes Configuration
14. **#17** - Single Flight Mutations

### **Phase 4: Database & Partnerships (10 weeks)**
15. **#18** - TanStack DB Integration
16. **#19** - Neon Database Integration  
17. **#20** - Convex Integration
18. **#21** - tRPC Integration

### **Phase 5: Authentication & Advanced (12 weeks)**
19. **#23** - Full-Stack Authentication
20. **#24** - Clerk Integration
21. **#11** - Vercel Deployment
22. **#22** - Hono Integration

---

## **Success Metrics**

### **Each Guide Must Include:**
1. **Completeness**: Setup to production deployment
2. **Working Examples**: Copy-paste ready code
3. **Troubleshooting**: Address common pitfalls and errors  
4. **GitHub Issue Resolution**: Link to and solve specific reported issues
5. **Next Steps**: Related guides and advanced topics

### **Format Consistency:**
- **Quick Start** section with minimal working example
- **Step-by-step implementation** with code samples
- **Common Problems** section addressing GitHub issues
- **Production Checklist** for deployment readiness
- **Related Resources** linking to other guides

---

## **Available Guides**

- ✅ [Use Environment Variables](./use-environment-variables.md) - Set up and use environment variables securely in TanStack Start applications

---

## **GitHub Issues Tracking**

**High Priority Issues to Address:**
- [#4533](https://github.com/TanStack/router/issues/4533) - Server Function TypeScript Issues (5 👍)
- [#4473](https://github.com/TanStack/router/issues/4473) - Cloudflare Vite Plugin Support (13 👍)  
- [#4460](https://github.com/TanStack/router/issues/4460) - Redirects in Server Functions (5 👍)
- [#4779](https://github.com/TanStack/router/issues/4779) - Cloudflare Hosting Docs
- [#4762](https://github.com/TanStack/router/issues/4762) - Netlify + Clerk Integration
- [#4802](https://github.com/TanStack/router/issues/4802) - Deferred Data Behavior
- [#4737](https://github.com/TanStack/router/issues/4737) - Server Function Middleware Patterns
- [#4514](https://github.com/TanStack/router/issues/4514) - URL Parameter Encoding
- [#4432](https://github.com/TanStack/router/issues/4432) - Project Structure Configuration
- [#4404](https://github.com/TanStack/router/issues/4404) - Custom Nitro Configuration

---

## **Contributing**

When adding new how-to guides:

1. **Focus on a single, well-defined task**
2. **Address specific GitHub issues when possible**
3. **Use clear headings and numbered steps**
4. **Include complete, working code examples**
5. **Address the most frequent problems at the end**
6. **Follow the dependency order outlined above**
7. **Link to related guides and GitHub issues**

**Priority should be given to guides that:**
- Solve actual user problems (GitHub issues)
- Enable TanStack Start's unique features (server functions)
- Support partnership integrations (Neon, Convex, Clerk, Netlify)
- Unblock deployment and production usage
