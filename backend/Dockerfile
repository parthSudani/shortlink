FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci
COPY backend backend
RUN npm run build -w backend
FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=10000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --from=build --chown=node:node /app/backend/package.json ./package.json
COPY --from=build --chown=node:node /app/backend/sequelize.config.cjs ./sequelize.config.cjs
COPY --from=build --chown=node:node /app/backend/migrations ./migrations
USER node
EXPOSE 10000
CMD ["sh", "-c", "npm run db:migrate && node dist/main.js"]

FROM runtime AS worker
CMD ["node", "dist/worker.js"]

FROM runtime AS api
CMD ["sh", "-c", "npm run db:migrate && node dist/main.js"]
