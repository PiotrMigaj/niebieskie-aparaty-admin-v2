FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10.12.1

FROM base AS builder
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NUXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nuxt
COPY --from=builder --chown=nuxt:nodejs /app/.output ./.output
USER nuxt
EXPOSE 4500
CMD ["node", ".output/server/index.mjs"]
