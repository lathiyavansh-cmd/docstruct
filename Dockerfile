# What this file does
#   Builds the single container that runs DocStruct in production (used by Render, see render.yaml).
#
# How it works
#   - Build stage: installs every package, builds the shared package, the API and the website,
#     then removes development-only packages.
#   - Run stage: a slim Node image plus Python 3 for the text extractor (standard library only, nothing to pip install).
#   - The API serves both /api and the built website, so one container hosts the whole app.
#
# Where it fits
#   Render builds this on every push to the deployed branch. Settings come from environment variables
#   (render.yaml). Module: repository and deployment (owner: Vansh).

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Copy only the package files first, so the slow install step is cached until dependencies change.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
# Render sets PORT; 10000 is its default.
EXPOSE 10000
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
