---
id: docker-production-setup
title: Docker Production Setup
---

Build production-ready Docker images for your TanStack Start application. This guide covers multi-stage builds, dependency caching, security best practices, and Docker Compose configuration.

## Prerequisites

Before you begin, ensure you have:

- [Docker Desktop](https://docs.docker.com/get-docker/).
- A TanStack Start application ready for deployment.

> [!TIP]
> New to Docker? Start with the [Docker Getting Started guide](https://docs.docker.com/get-started/) or the [official React.js Docker sample guide](https://docs.docker.com/guides/react/).

## Quick Start

A `Dockerfile` contains instructions for building your application into a container image. It defines the base image, dependencies, build steps, and how your application runs. Once built, this image can run identically on any machine or server with Docker installed.

### Step 1: Create a `Dockerfile` in your project root:

```dockerfile
# =========================================
# Stage 1: Build the TanStack Start Application
# =========================================
ARG NODE_VERSION=24.12.0-slim

# Use a lightweight Node.js image for building (customizable via ARG)
FROM node:${NODE_VERSION} AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package-related files first to leverage Docker's caching mechanism
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Install project dependencies with frozen lockfile for reproducible builds
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/usr/local/share/.cache/yarn \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
  if [ -f package-lock.json ]; then \
    npm ci --no-audit --no-fund; \
  elif [ -f yarn.lock ]; then \
    corepack enable yarn && yarn install --frozen-lockfile --production=false; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  else \
    echo "No lockfile found." && exit 1; \
  fi

# Copy the rest of the application source code into the container
COPY . .

# Build the TanStack Start application (outputs to /app/.output)
# Cache mount speeds up subsequent builds by persisting the build cache
RUN --mount=type=cache,target=/app/.vinxi/cache \
  if [ -f package-lock.json ]; then \
    npm run build; \
  elif [ -f yarn.lock ]; then \
    yarn build; \
  elif [ -f pnpm-lock.yaml ]; then \
    pnpm build; \
  else \
    echo "No lockfile found." && exit 1; \
  fi

# =========================================
# Stage 2: Run the TanStack Start Server
# =========================================
FROM node:${NODE_VERSION} AS runner

# Set the working directory
WORKDIR /app

# Set environment variable for production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy the built server and client assets from the builder stage
COPY --from=builder /app/.output ./

# Switch to the non-root user
USER node

# Expose the application port
EXPOSE 3000

ENTRYPOINT ["node", "server/index.mjs"]
```

### Step 2: Create a `.dockerignore` file:

A `.dockerignore` file excludes unnecessary files from the build context. This speeds up builds and reduces image size.

```
# TanStack Start Production .dockerignore
# Optimized for minimal build context & security
# =============================================

# -----------------------------------------
# Dependencies (installed fresh in Docker)
# -----------------------------------------
node_modules/
.npm/
.pnpm-store/
.yarn/

# -----------------------------------------
# Build Outputs (regenerated during build)
# -----------------------------------------
.output/
.nitro/
.vinxi/
dist/
build/
out/

# -----------------------------------------
# Test & Coverage Files
# -----------------------------------------
coverage/
__tests__/
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx
vitest.config.*
jest.config.*
cypress/
playwright/
playwright-report/
test-results/

# -----------------------------------------
# Development & Debug Files
# -----------------------------------------
*.log
*.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.eslintcache

# -----------------------------------------
# Environment & Secrets (SECURITY)
# -----------------------------------------
.env
.env.*
!.env.example
*.pem
*.key
*.crt
secrets/
.secrets/

# -----------------------------------------
# IDE & Editor Files
# -----------------------------------------
.idea/
.vscode/
*.swp
*.swo
*~
*.sublime-*

# -----------------------------------------
# OS Generated Files
# -----------------------------------------
.DS_Store
.DS_Store?
._*
Thumbs.db
ehthumbs.db
Desktop.ini

# -----------------------------------------
# Version Control
# -----------------------------------------
.git/
.gitignore
.gitattributes
.github/
.gitlab/
.hg/
.svn/

# -----------------------------------------
# Docker Files (not needed in build context)
# -----------------------------------------
Dockerfile*
docker-compose*.yml
compose*.yml
.dockerignore

# -----------------------------------------
# Task Runners & Build Scripts
# -----------------------------------------
Makefile
Taskfile.yml
Taskfile.yaml
Justfile

# -----------------------------------------
# Documentation (not needed in production)
# -----------------------------------------
README.md
README*
CHANGELOG*
CONTRIBUTING*
LICENSE*
docs/
*.md

# -----------------------------------------
# AI & Development Tools
# -----------------------------------------
*.ai
*.aider*
*.chatgpt*
.cursor/
.copilot/
__pycache__/
openai/
kiro/
anthropic/
ai_outputs/
ai_cache/
.claude/

# -----------------------------------------
# Misc Development Files
# -----------------------------------------
*.map
*.d.ts.map
.editorconfig
.prettierrc*
.eslintrc*
eslint.config.*
prettier.config.*
tsconfig.*.json
!tsconfig.json
```

### Step 3: Build and Run

Build your Docker image:

```bash
docker build -t my-tanstack-app .
```

Run the container:

```bash
docker run -p 3000:3000 my-tanstack-app
```

Verify it's working by visiting [http://localhost:3000](http://localhost:3000).

> [!TIP]
> Use `docker run -d` to run in detached mode (background), or `docker run --rm` to automatically remove the container when stopped.

## Understanding the Dockerfile

### What Are Multi-Stage Builds?

The Dockerfile uses **multi-stage builds** to create optimized production images. This pattern separates the build environment from the runtime environment:

| Stage       | Purpose                   | Contents                               |
| ----------- | ------------------------- | -------------------------------------- |
| **Builder** | Compiles your application | Dependencies, source code, build tools |
| **Runner**  | Runs your application     | Only the compiled `.output/` directory |

The final image contains only what's needed to run your app—no source code, no `node_modules`, no build tools. This reduces image size from 1GB+ to ~100-150MB.

### How Does Layer Caching Work?

Docker builds images layer by layer and caches each layer. The Dockerfile orders commands to maximize cache efficiency:

```dockerfile
# 1. Copy package files (rarely change) → cached
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# 2. Install dependencies → cached if package files unchanged
RUN npm ci

# 3. Copy source code (changes frequently) → rebuilds from here
COPY . .
RUN npm run build
```

When you modify your application code, Docker reuses cached layers for steps 1-2 and only rebuilds step 3. You'll see `CACHED` in your build output for unchanged layers.

### Build-Time Cache Mounts

The Dockerfile uses Docker's **BuildKit cache mounts** - an advanced feature that persists package manager caches between builds:

```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/usr/local/share/.cache/yarn \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
  npm ci
```

This is different from layer caching. Even if the layer needs to rebuild (e.g., you added a new dependency), the downloaded packages are still available. This can reduce build times by 50-80% for large projects.

> [!TIP]
> BuildKit is enabled by default in Docker Desktop and recent Docker versions. For older versions, set `DOCKER_BUILDKIT=1` before building.

### Security Best Practices

The Dockerfile implements several security measures that protect your production environment:

1. **Non-root execution**: The `USER node` directive ensures your application runs as an unprivileged user. Even if an attacker exploits a vulnerability, they can't modify system files or install packages.

2. **Minimal attack surface**: The final image contains only your compiled application. No compilers, no package managers, no source code that could reveal implementation details.

3. **Slim base image**: The `slim` variant of Node.js images removes unnecessary packages and documentation, reducing image size and potential vulnerabilities while maintaining compatibility.

4. **No secrets in layers**: Environment variables with sensitive data should be passed at runtime via `-e` or `--env-file`, never baked into the image.

## Docker Compose

Docker Compose simplifies container management by defining your entire stack in a single file. It's essential for local development, testing, and single-host deployments.

### Basic Configuration

Create a `compose.yml` file in your project root:

```yaml
services:
  tanstack-start-app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NODE_VERSION: 24.12.0-slim
    image: tanstack-start-image
    container_name: tanstack-start-container
    environment:
      NODE_ENV: production
      PORT: 3000
      HOST: 0.0.0.0
    ports:
      - '3000:3000'
    restart: unless-stopped
```

### Essential Commands

```bash
# Build and start (foreground - see logs in terminal)
docker compose up --build

# Build and start (background - returns terminal control)
docker compose up -d --build

# View logs from background container
docker compose logs -f

# Stop and remove containers
docker compose down

# Rebuild without cache (useful after Dockerfile changes)
docker compose build --no-cache
```

### Environment Variables

For applications requiring secrets (API keys, database credentials), never hardcode them in your Dockerfile or compose file. Use environment variables:

```yaml
services:
  tanstack-start-app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NODE_VERSION: 24.12.0-slim
    image: tanstack-start-image
    container_name: tanstack-start-container
    environment:
      NODE_ENV: production
      PORT: 3000
      HOST: 0.0.0.0
      # Reference variables from your shell or .env file
      DATABASE_URL: ${DATABASE_URL}
      API_KEY: ${API_KEY}
    # Load all variables from a file
    env_file:
      - .env.production
    ports:
      - '3000:3000'
    restart: unless-stopped
```

Create a `.env.production` file (never commit this):

```bash
DATABASE_URL=postgresql://user:password@host:5432/db
API_KEY=your-secret-api-key
```

> [!WARNING]
> Never commit `.env` files containing secrets to version control. Add them to your `.gitignore` file.

## Package Manager Specific Dockerfiles

The main Dockerfile automatically detects your package manager. However, if you prefer a dedicated Dockerfile for your specific package manager, use these optimized versions:

### pnpm

```dockerfile
# =========================================
# Stage 1: Build the TanStack Start Application
# =========================================
ARG NODE_VERSION=24.12.0-slim

FROM node:${NODE_VERSION} AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# =========================================
# Stage 2: Run the TanStack Start Server
# =========================================
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=builder /app/.output ./

USER node

EXPOSE 3000

ENTRYPOINT ["node", "server/index.mjs"]
```

### npm

```dockerfile
# =========================================
# Stage 1: Build the TanStack Start Application
# =========================================
ARG NODE_VERSION=24.12.0-slim

FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

# =========================================
# Stage 2: Run the TanStack Start Server
# =========================================
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=builder /app/.output ./

USER node

EXPOSE 3000

ENTRYPOINT ["node", "server/index.mjs"]
```

### yarn

```dockerfile
# =========================================
# Stage 1: Build the TanStack Start Application
# =========================================
ARG NODE_VERSION=24.12.0-slim

FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

# =========================================
# Stage 2: Run the TanStack Start Server
# =========================================
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=builder /app/.output ./

USER node

EXPOSE 3000

ENTRYPOINT ["node", "server/index.mjs"]
```

## Troubleshooting

### Build Fails with "npm ci" Error

This typically means your lockfile is out of sync with `package.json`:

```bash
# Regenerate the lockfile
rm -rf node_modules package-lock.json
npm install

# Commit the updated lockfile
git add package-lock.json
git commit -m "Update package-lock.json"
```

### Container Exits Immediately

Check the container logs for the actual error:

```bash
docker logs tanstack-start-container
```

**Common causes:**

- **Missing environment variables**: Ensure all required env vars are set
- **Build output missing**: Verify `.output/` exists and contains `server/index.mjs`
- **Port already in use**: Check if another process is using port 3000

### Cannot Connect to Application

First, verify the container is actually running:

```bash
docker ps
docker port tanstack-start-container
```

If it's running but you can't connect:

1. **Wrong host binding**: Ensure `HOST=0.0.0.0` is set. Using `localhost` inside a container only binds to the container's loopback interface, not the host.

2. **Firewall issues**: Check if your firewall allows connections on port 3000

3. **Wrong port mapping**: Verify the port mapping with `docker port tanstack-start-container`

### Large Image Size

If your final image exceeds 200MB:

1. **Verify multi-stage build**: Ensure you're copying from the builder stage, not the entire filesystem

2. **Check `.dockerignore`**: Make sure `node_modules/` and build artifacts are excluded

3. **Use slim or alpine image tags**: Use `node:24.12.0-slim` or `node:24.12.0-alpine` instead of the full `node:24` image (~1GB).

4. **Analyze image layers**: Use `docker history tanstack-start-image` to see what's consuming space

## Example Repository

A complete working example with all Docker configuration files is available at:
[github.com/kristiyan-velkov/frontend-prod-dockerfiles/tree/main/tanstack-start](https://github.com/kristiyan-velkov/frontend-prod-dockerfiles/tree/main/tanstack-start)
