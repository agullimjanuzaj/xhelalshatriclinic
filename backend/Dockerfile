FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget openssl libc6-compat

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

RUN mkdir -p uploads

EXPOSE 4000

CMD sh -c "node node_modules/prisma/build/index.js db push --accept-data-loss && (node node_modules/prisma/build/index.js db seed || echo 'Seed skipped (data already exists)') && node dist/main"
