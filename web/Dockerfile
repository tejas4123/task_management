FROM node:22-alpine

WORKDIR /app

# Copy the manifests first so the install layer survives source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5174

# Vite binds 0.0.0.0 (see vite.config.ts) so the port is reachable from the host.
CMD ["npm", "run", "dev"]
