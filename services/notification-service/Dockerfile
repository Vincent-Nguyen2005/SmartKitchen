FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN npm install
COPY . .
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN node -e "const fs=require('fs'),f='prisma/schema.prisma',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
# Dedicated client: node_modules/.prisma/client-notification (kept by npm prune, copied with node_modules).
RUN npx --no-install prisma generate
RUN npm run build
# prisma (CLI) is a production dependency so `prisma migrate deploy` can run at start.
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
EXPOSE 4010
USER node
# Apply pending migrations (never migrate dev / db push), then start. Safe to run on every start:
# migrate deploy is idempotent and takes an advisory lock, so concurrent instances do not race.
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && npm start"]
