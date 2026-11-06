FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN npm install
COPY . .
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN node -e "const fs=require('fs'),f='prisma/schema.prisma',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN if [ -f prisma/schema.prisma ] && grep -Eq '^[[:space:]]*model[[:space:]]+[[:alnum:]_]+[[:space:]]*\{' prisma/schema.prisma; then npx prisma generate; else echo "No Prisma models found; skipping generate"; fi
RUN npm run build
RUN npm prune --omit=dev
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
<<<<<<< HEAD
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
=======
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/node_modules/.prisma/client-recipe ./node_modules/.prisma/client-recipe
COPY --from=build /app/dist ./dist
>>>>>>> origin/merge-team-main
EXPOSE 4006
USER node
CMD ["npm", "start"]
