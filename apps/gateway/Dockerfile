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
# dns.lookup runs on the libuv pool, and libuv gives DNS at most half of it. With the default 4, two lookups for
# missing containers (about 2.3 s each) stall every other lookup, so healthy services look DOWN and requests wait.
ENV UV_THREADPOOL_SIZE=32
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
EXPOSE 4000
USER node
CMD ["npm", "start"]
