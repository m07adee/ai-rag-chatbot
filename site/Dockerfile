# 1) build the static Next.js site
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
ENV STATIC_EXPORT=1
RUN npm run build

# 2) serve it with Caddy, proxying /api to the FastAPI service
FROM caddy:2-alpine
COPY site/Caddyfile /etc/caddy/Caddyfile
COPY --from=web /web/out /srv
