FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN npm install
COPY . .
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN node -e "const fs=require('fs'),f='prisma/schema.prisma',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN if [ -f prisma/schema.prisma ] && grep -q 'model ' prisma/schema.prisma; then npx prisma generate; else echo "No Prisma models found; skipping generate"; fi
RUN npm run build
RUN npm prune --omit=dev
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 4009
CMD ["npm", "start"]
