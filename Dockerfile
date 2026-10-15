# ONE container that serves both the website and the API. Use this for pay-per-use hosts such as Google Cloud Run.
# (The docker-compose setup uses backend/Dockerfile and frontend/Dockerfile instead.)
# Build from the project root:  docker build -t kumtun .

FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/src ./src
COPY backend/db ./db
COPY --from=web /web/dist ./public
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
