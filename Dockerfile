# ---------- Etapa 1: build ----------
FROM oven/bun:1 AS builder
WORKDIR /app

# Gera um servidor Node (em vez do target Cloudflare) para rodar em container/VPN
ENV NITRO_PRESET=node-server
ENV SERVER_PRESET=node-server
ENV NODE_ENV=production

# Dependências (cache-friendly)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Código-fonte
COPY . .

# Variáveis VITE_* são embutidas no bundle do cliente no momento do build.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

RUN bun run build

# ---------- Etapa 2: runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Apenas o artefato de build é copiado (imagem pequena, sem node_modules de dev)
COPY --from=builder /app/.output ./.output

# Usuário sem privilégios
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
