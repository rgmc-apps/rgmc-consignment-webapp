# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_BASE_URL is already set in .env.production.
# Pass --build-arg VITE_API_BASE_URL=<url> to override at build time.
ARG VITE_API_BASE_URL
RUN if [ -n "$VITE_API_BASE_URL" ]; then \
      echo "VITE_API_BASE_URL=$VITE_API_BASE_URL" > .env.production; \
    fi

RUN npm run build

# ── Stage 2: Serve ─────────────────────────────────────────────────────────────
FROM nginx:stable-alpine

# gettext provides envsubst for $PORT substitution at startup
RUN apk add --no-cache gettext

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf.template

# Cloud Run injects $PORT; default to 8080 if running locally
ENV PORT=8080

# Substitute $PORT in the nginx template, then start nginx
CMD envsubst '$PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf \
    && nginx -g 'daemon off;'
