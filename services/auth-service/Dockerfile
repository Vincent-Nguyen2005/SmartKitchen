FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY . .
RUN if [ -f prisma/schema.prisma ] && grep -q 'model ' prisma/schema.prisma; then npx prisma generate; else echo "No Prisma models found; skipping generate"; fi
RUN npm run build
RUN npm prune --omit=dev
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 4001
CMD ["npm", "start"]
