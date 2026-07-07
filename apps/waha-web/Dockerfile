# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy root monorepo files to resolve workspace workspaces
COPY package.json package-lock.json ./
COPY apps/waha-web/package.json ./apps/waha-web/package.json

# Install dependencies (only what is needed for build)
RUN npm ci --workspace @waha-control-center/waha-web

# Copy actual source code
COPY apps/waha-web ./apps/waha-web

# Build frontend
RUN npm run build --workspace @waha-control-center/waha-web

# Production serving stage
FROM nginx:alpine

COPY --from=build /app/apps/waha-web/dist /usr/share/nginx/html

# Expose standard port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
