# One-shot job: runs the loader and exits. `docker compose up` starts it after
# the registries, the Resolver, ClickHouse and Keycloak are healthy.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY extracts ./extracts
CMD ["npx", "tsx", "src/index.ts"]
