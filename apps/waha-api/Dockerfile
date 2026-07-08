# Build and running container
FROM node:20-alpine

WORKDIR /app

# Copy root monorepo files to resolve workspace workspaces
COPY package.json package-lock.json ./
COPY apps/waha-api/package.json ./apps/waha-api/package.json

# Install dependencies
RUN npm ci --workspace @waha-control-center/waha-api

# Copy actual source code
COPY apps/waha-api ./apps/waha-api
COPY migrations ./migrations

# Build typescript project
RUN npm run build --workspace @waha-control-center/waha-api

# Expose backend port
EXPOSE 3000

ENV NODE_ENV=production

# Start application
CMD ["npm", "--workspace", "@waha-control-center/waha-api", "run", "start"]
