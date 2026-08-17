# ---- Stage 1: builder ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ---- Stage 2: runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Jakarta

# tzdata untuk penjadwalan cron sesuai WIB; openssl agar Prisma query/schema engine
# (dibangun untuk target linux-musl-openssl-3.0.x) bisa memuat libssl di runtime.
RUN apk add --no-cache tzdata openssl

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data/documents /app/data/templates \
  && addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app
USER app

ENTRYPOINT ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
