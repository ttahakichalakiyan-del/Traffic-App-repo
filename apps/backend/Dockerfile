FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace files
COPY package*.json ./
COPY turbo.json ./

# Copy local packages
COPY packages/ ./packages/

# Copy backend package.json for dependency install
COPY apps/backend/package*.json ./apps/backend/

# Install all dependencies (workspace-aware)
RUN npm install --legacy-peer-deps

# Build shared-types first (local package, not on npm registry)
RUN cd packages/shared-types && npm run build

# Copy backend source
COPY apps/backend/ ./apps/backend/

# Build backend
RUN cd apps/backend && npm run build

# ---- Runner Stage ----
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy everything needed from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./package.json

USER nodejs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
