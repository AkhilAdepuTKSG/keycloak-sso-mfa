# Build the SPA once, serve it with nginx. The SAME image runs as all four
# portals; each container is parameterised at start-up (see docker-entrypoint.d)
# to a different Keycloak client / port / title.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Runtime config injector: writes /env-config.js from container env at start.
COPY docker-entrypoint.d/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-env-config.sh
EXPOSE 80
