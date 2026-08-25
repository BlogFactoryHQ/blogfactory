FROM node:22-alpine AS build
WORKDIR /workspace/web

COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY README.md ../README.md
COPY docs/ ../docs/
RUN npm run build

FROM nginx:1.27-alpine
ENV API_UPSTREAM=http://api:3000
ENV NGINX_ENVSUBST_FILTER=^(API_UPSTREAM|NGINX_RESOLVER)$
COPY web/docker/15-resolver.envsh /docker-entrypoint.d/15-resolver.envsh
COPY web/docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY web/docker/proxy_params /etc/nginx/proxy_params
COPY --from=build /workspace/web/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
