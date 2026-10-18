FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN if [ "$(head -c 3 package.json | od -An -t x1 | tr -d ' \\n')" = "efbbbf" ]; then tail -c +4 package.json > package.json.tmp && mv package.json.tmp package.json; fi
RUN npm install
COPY . .
RUN if [ "$(head -c 3 package.json | od -An -t x1 | tr -d ' \\n')" = "efbbbf" ]; then tail -c +4 package.json > package.json.tmp && mv package.json.tmp package.json; fi
RUN if [ "$(head -c 3 prisma/schema.prisma | od -An -t x1 | tr -d ' \\n')" = "efbbbf" ]; then tail -c +4 prisma/schema.prisma > prisma/schema.prisma.tmp && mv prisma/schema.prisma.tmp prisma/schema.prisma; fi
RUN if grep -q '^model ' prisma/schema.prisma; then corepack pnpm prisma generate; else echo "No Prisma models yet; skipping client generation"; fi
RUN npm run build
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
EXPOSE 4011
CMD ["npm", "start"]
