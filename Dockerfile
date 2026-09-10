FROM node:22.23.2-bookworm-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY dist-api/ ./
COPY dist/ ./web/
USER 1001:1001
CMD ["node", "server.mjs"]
