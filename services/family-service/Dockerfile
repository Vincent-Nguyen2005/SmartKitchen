FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY . .
RUN if [ -f prisma/schema.prisma ] && grep -Eq '^[[:space:]]*model[[:space:]]+[[:alnum:]_]+[[:space:]]*\{' prisma/schema.prisma; then npx prisma generate; else echo "No Prisma models found; skipping generate"; fi
RUN npm run build
RUN npm prune --omit=dev
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
EXPOSE 4002
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
