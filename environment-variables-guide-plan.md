# Environment Variables Guide - Implementation Plan

## Overview

Environment variables are a critical but under-documented aspect of TanStack Router applications. Based on analysis of the codebase, examples, and common developer questions, we need comprehensive documentation covering all contexts where environment variables are used.

## Key Pain Points Identified

1. **Confusion between client vs server contexts** - when to use `process.env` vs `import.meta.env`
2. **Bundler-specific prefixes** - `VITE_`, `PUBLIC_`, etc.
3. **Build-time vs runtime variables** - when variables are resolved
4. **Type safety** - making environment variables type-safe
5. **Security concerns** - preventing sensitive data exposure to client
6. **Different deployment environments** - development, staging, production

## Current Implementation Analysis

### TanStack Start
- Uses `load-env-plugin` that automatically loads `.env` files
- `defineReplaceEnv` function creates both `process.env.X` and `import.meta.env.X` replacements
- Server functions can access `process.env` directly without prefixes

### TanStack Router (non-Start)
- Relies on bundler-specific environment variable handling
- Vite: requires `VITE_` prefix for client-side exposure
- Webpack/Rspack: requires `PUBLIC_` prefix or manual configuration

### Examples Found
- **Supabase**: `process.env.SUPABASE_URL` in server functions
- **Firebase**: `import.meta.env.VITE_PUBLIC_FIREBASE_API_KEY` for client config
- **Auth providers**: Mix of client and server-side variables
- **Testing**: `import.meta.env.VITE_NODE_ENV === 'test'` patterns

## Proposed Guide Structure

### **How to Use Environment Variables in TanStack Router**

#### **Quick Start**
- Basic `.env` file setup
- Client vs server variable access patterns
- Security best practices summary

#### **Environment Variable Contexts**

1. **Server-Side Context (TanStack Start)**
   - Server functions and API routes
   - `process.env.VARIABLE_NAME` access
   - No prefix requirements
   - Database credentials, API secrets

2. **Client-Side Context**
   - Component code and client bundles
   - Bundler-specific prefixes required
   - Public configuration only

3. **Build-Time vs Runtime**
   - When variables are resolved and replaced
   - Static replacement vs dynamic access

#### **Bundler-Specific Configuration**

1. **Vite (Most Common)**
   - `.env` file locations and loading order
   - `VITE_` prefix for client exposure
   - `import.meta.env` access pattern
   - TypeScript integration

2. **Webpack**
   - DefinePlugin configuration
   - Environment variable injection
   - Custom prefix setup

3. **Rspack**
   - `PUBLIC_` prefix convention
   - Configuration differences from Vite

4. **ESBuild**
   - Define flag usage
   - Manual environment injection

#### **Type Safety**
- Creating TypeScript declarations for env vars
- Vite's env.d.ts patterns
- Runtime validation with Zod
- IDE autocomplete setup

#### **Security Best Practices**
- Server-only vs client-exposed variables
- Prefix conventions and their security implications
- `.env` file gitignore patterns
- Production deployment considerations

#### **Different Environments**

1. **Development**
   - `.env.local`, `.env.development` file hierarchy
   - Hot reloading considerations
   - Debug variables

2. **Testing**
   - Test-specific environment variables
   - Mocking environment variables in tests
   - CI/CD environment setup

3. **Production**
   - Platform-specific variable injection (Vercel, Netlify, etc.)
   - Build-time variable validation
   - Runtime environment detection

#### **Common Patterns and Examples**

1. **API Configuration**
   ```typescript
   // Server-side (TanStack Start)
   const apiUrl = process.env.INTERNAL_API_URL
   
   // Client-side (Vite)
   const publicApiUrl = import.meta.env.VITE_PUBLIC_API_URL
   ```

2. **Authentication Setup**
   - Auth0, Clerk, Supabase patterns
   - Public keys vs private keys
   - Redirect URLs and domains

3. **Database Connections**
   - Server-only database URLs
   - Connection pooling configuration

4. **Feature Flags**
   - Client-side feature toggles
   - A/B testing configuration

#### **Common Problems**

1. **"Cannot read property of undefined"**
   - Missing bundler prefix
   - Incorrect context (client vs server)
   - Build-time vs runtime confusion

2. **Variables not updating**
   - Bundler restart requirements
   - Caching issues
   - File location problems

3. **TypeScript errors**
   - Missing type declarations
   - Incorrect type definitions

4. **Security issues**
   - Accidentally exposing secrets to client
   - Using wrong variable context

5. **Deployment issues**
   - Platform-specific configuration
   - Build vs runtime injection
   - Missing environment variables

#### **Integration Examples**

1. **Database Setup (Server-only)**
2. **Authentication Providers (Mixed)**
3. **External APIs (Mixed)**
4. **Feature Flags (Client-side)**
5. **Analytics (Client-side)**

#### **Platform-Specific Deployment**

1. **Vercel**
   - Environment variable management
   - Preview deployments
   - Build vs runtime variables

2. **Netlify**
   - Site settings configuration
   - Build environment variables
   - Runtime environment injection

3. **Cloudflare Pages**
   - Workers environment variables
   - KV namespace integration

4. **Traditional hosting**
   - Docker environment variables
   - PM2 configuration
   - Load balancer considerations

## Implementation Priority

1. **Phase 1: Core Guide** - Basic patterns, security, common contexts
2. **Phase 2: Bundler-Specific** - Detailed configuration for each bundler
3. **Phase 3: Platform Integration** - Deployment-specific guidance
4. **Phase 4: Advanced Patterns** - Type safety, validation, complex scenarios

## Next Steps

1. Create the main guide with practical examples from existing codebase
2. Reference real patterns from Supabase, Firebase, and auth examples
3. Include working code snippets that can be copy-pasted
4. Add troubleshooting section based on common GitHub issues
5. Cross-reference with existing authentication and deployment guides

This guide would fill a critical gap in the documentation and address one of the most common developer confusion points.