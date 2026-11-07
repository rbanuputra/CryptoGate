FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/agent/package.json apps/agent/
COPY apps/agent/prisma apps/agent/prisma/
RUN npm ci --ignore-scripts
RUN npx prisma generate --schema=apps/agent/prisma/schema.prisma

FROM base AS builder
COPY --from=deps /app .
COPY packages/shared packages/shared
COPY apps/agent apps/agent
RUN npx turbo build --filter=@cryptogate/agent

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 agent
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/agent/dist ./apps/agent/dist
COPY --from=builder /app/apps/agent/package.json ./apps/agent/package.json
COPY --from=builder /app/apps/agent/prisma ./apps/agent/prisma
RUN mkdir -p /app/data/candles && chown -R 1001:1001 /app/data
USER agent
EXPOSE 4000
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then ./node_modules/.bin/prisma db push --schema=apps/agent/prisma/schema.prisma --skip-generate; fi && node apps/agent/dist/index.js"]
