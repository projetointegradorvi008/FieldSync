FROM node:24.20.0-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# ── Estágio de build (só para produção) ──────────────────────────
# Separado do `builder` acima de propósito: docker-compose.dev.yml usa
# `target: builder` (código vem do bind mount, `npm run dev` recompila em
# runtime) e NUNCA precisa deste `npm run build` — que baixa as fontes
# Geist/Geist Mono de fonts.googleapis.com (next/font/google) e falha sem
# internet/atrás de proxy. Se esse RUN ficasse no `builder`, subir em modo
# dev exigiria rede para algo que o dev nem usa.
FROM builder AS build
RUN npm run build

# ── Estágio de produção ───────────────────────────────────────
FROM node:24.20.0-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER appuser

EXPOSE 3000
CMD ["node", "server.js"]
