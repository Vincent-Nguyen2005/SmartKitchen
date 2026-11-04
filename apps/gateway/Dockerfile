FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN npm install
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
EXPOSE 4000
USER node
CMD ["npm", "start"]
