# Base Node.js image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for the entire monorepo
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/.output ./.output

# Set environment variables for production
#ENV NODE_ENV=production
#ENV VITE_CONVEX_URL=backend-domain
#ENV CONVEX_SELF_HOSTED_URL=backend-domain
#ENV CONVEX_SELF_HOSTED_ADMIN_KEY=self-hosted-convex|admin-key

# Expose the port the app runs on
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]