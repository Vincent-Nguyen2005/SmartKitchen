# Debian slim (glibc), not Alpine: onnxruntime-node (used by @huggingface/transformers for photo recognition) ships
# glibc binaries only. sharp, tesseract.js and Prisma run on both.
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# onnxruntime-node would otherwise try to download CUDA binaries during npm install (CPU only here).
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip
COPY package*.json ./
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN npm install
COPY . .
RUN node -e "const fs=require('fs'),f='package.json',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN node -e "const fs=require('fs'),f='prisma/schema.prisma',b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)fs.writeFileSync(f,b.subarray(3))"
RUN npx --no-install prisma generate
RUN npm run build
# Photo recognition: download the quantized CLIP model now, so no request ever downloads it (skipped, with a note,
# while @huggingface/transformers is not a dependency).
ENV CLIP_MODEL_DIR=/app/models
RUN node dist/scripts/download-clip-model.js
RUN npm prune --omit=dev
# onnxruntime-node ships binaries for every OS / CPU (~200 MB); keep only this image's linux/<arch> (~43 MB).
RUN if [ -d node_modules/onnxruntime-node/bin/napi-v3 ]; then \
      ARCH="$(node -p process.arch)"; \
      find node_modules/onnxruntime-node/bin/napi-v3 -mindepth 2 -maxdepth 2 -type d ! -path "*/linux/${ARCH}" -exec rm -rf {} +; \
    fi
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# wget: the compose healthcheck; openssl: Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates wget && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/models ./models
ENV CLIP_MODEL_DIR=/app/models
# Photo uploads live on a named volume mounted here; a fresh volume copies this ownership so USER node can write.
RUN mkdir -p /data/uploads/inventory && chown -R node:node /data/uploads
ENV INVENTORY_UPLOAD_DIR=/data/uploads/inventory
EXPOSE 4003
USER node
# Apply pending migrations (never migrate dev / db push), then start. Safe to run on every start.
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && npm start"]
