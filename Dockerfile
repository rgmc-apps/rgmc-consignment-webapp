# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Alpine ships without git; vite.config.ts shells out to `git rev-parse` for the
# build-time version stamp (see getBuildId()). Installed as its own layer, before
# the source copy, so it's cached and unaffected by app code changes.
RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# ── Stage 2: Serve ─────────────────────────────────────────────────────────────
FROM nginx:stable-alpine

# gettext provides envsubst for $PORT substitution at startup
RUN apk add --no-cache gettext ca-certificates

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Cloud Run injects $PORT; default to 8080 if running locally
ENV PORT=8080

ENTRYPOINT ["/docker-entrypoint.sh"]
