# ResearchMesh — one container: the API also serves the built web app.
# Build:  docker build -t researchmesh .
# Run:    docker run -p 4000:4000 --env-file server/.env -e NODE_ENV=production researchmesh

FROM node:22-alpine AS web
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /app/client/dist /app/client/dist
EXPOSE 4000
USER node
CMD ["node", "src/index.js"]
