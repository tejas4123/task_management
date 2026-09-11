# Stage 1 - dependencies and source.
#
# This stage is also the local development container: docker-compose.override.yml
# targets it and runs the Vite dev server against a bind-mounted ./frontend.
FROM node:22-alpine AS dev

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]

# Stage 2 - production bundle.
#
# `npm run build` runs in mode=production, so Vite reads .env.production and
# inlines VITE_AUTH_URL / VITE_ENGAGEMENT_URL / VITE_TASK_URL into the assets.
FROM dev AS build

RUN npm run build

# Stage 3 - static file server. No Node, no Vite dev server in production.
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
