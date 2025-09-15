# Base Node.js image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for the entire monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy the example project files
COPY examples/react/start-convex-trellaux ./examples/react/start-convex-trellaux/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies for the monorepo
RUN pnpm install

# Set working directory to the example project
WORKDIR /app/examples/react/start-convex-trellaux

# Build the project
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/examples/react/start-convex-trellaux/dist ./dist
COPY --from=builder /app/examples/react/start-convex-trellaux/package.json ./
COPY --from=builder /app/examples/react/start-convex-trellaux/convex ./convex

# Install production dependencies only
RUN npm install -g pnpm
RUN pnpm install --prod

# Set environment variables for production
ENV NODE_ENV=production
ENV VITE_CONVEX_URL=backend-domain
ENV CONVEX_SELF_HOSTED_URL=backend-domain
ENV CONVEX_SELF_HOSTED_ADMIN_KEY=self-hosted-convex|admin-key


# Expose the port the app runs on
EXPOSE 3000

# Start the application
# Using vite preview instead of start as that's the correct command for serving production builds
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]