FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dépendances d'abord (cache Docker)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/health || exit 1

CMD ["node", "src/server.js"]
