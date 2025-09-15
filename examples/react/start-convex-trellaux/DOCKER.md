# Docker Setup for TanStack Router Example: Convex Trellaux

This document explains how to use the Dockerfile to build and run the Convex Trellaux example project.

## Overview

The Dockerfile in the root directory builds and deploys the example project located at `examples/react/start-convex-trellaux`. It uses a multi-stage build process:

1. **Builder stage**: Compiles the application using Node.js and pnpm
2. **Production stage**: Creates a minimal image with only the necessary files to run the application

## Building the Docker Image

From the root directory of the repository, run:

```bash
docker build -t convex-trellaux .
```

## Running the Docker Container

After building the image, you can run the container with:

```bash
docker run -p 3000:3000 convex-trellaux
```

This will make the application available at http://localhost:3000

## Environment Variables

The Dockerfile sets the following environment variables:

- `NODE_ENV=production`: Sets the Node.js environment to production
- `VITE_CONVEX_URL=http://127.0.0.1:3210`: URL for the Convex backend
- `CONVEX_DEPLOYMENT=anonymous:anonymous-start-convex-trellaux`: The Convex deployment ID

If you need to override these variables, you can do so when running the container:

```bash
docker run -p 3000:3000 -e VITE_CONVEX_URL=your-convex-url convex-trellaux
```

## Notes

- The application uses Vite for building and serving the frontend
- The Convex backend is used for the database functionality
- For a production deployment, you would need to set up your own Convex deployment and update the environment variables accordingly