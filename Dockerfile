# syntax=docker/dockerfile:1

# ---------- Frontend build ----------
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm install
COPY frontend frontend
RUN npm run build --workspace=frontend

# ---------- Backend build ----------
FROM node:20-bookworm-slim AS backend-build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm install
COPY backend backend
COPY --from=frontend-build /app/frontend/dist frontend/dist
RUN npm run build --workspace=backend
RUN npm prune --omit=dev

# ---------- Runtime ----------
FROM node:20-bookworm-slim AS runtime
ARG TARGETARCH
ARG LITESTREAM_VERSION=0.3.13
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/backend/data/budget.sqlite
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-${TARGETARCH}.tar.gz" \
       | tar -xz -C /usr/local/bin litestream \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*
COPY --from=backend-build /app/node_modules node_modules
COPY --from=backend-build /app/backend/dist backend/dist
COPY --from=backend-build /app/backend/package.json backend/package.json
COPY backend/litestream.yml backend/litestream.yml
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]
WORKDIR /app/backend
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
