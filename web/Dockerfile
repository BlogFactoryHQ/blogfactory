FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_WAITLIST_URL=https://blogfactory.io
ENV VITE_WAITLIST_URL=$VITE_WAITLIST_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ENV API_UPSTREAM=http://api:3000
ENV NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/proxy_params /etc/nginx/proxy_params
COPY --from=build /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1
