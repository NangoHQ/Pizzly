# ------------------
# New tmp image
# ------------------
FROM node:18.19.1-bullseye-slim AS tmp

# Setup the app WORKDIR
WORKDIR /app/tmp

# Copy and install dependencies separately from the app's code
# To leverage Docker's cache when no dependency has change
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/jobs/package.json ./packages/jobs/package.json
COPY packages/node-client/package.json ./packages/node-client/package.json
COPY packages/persist/package.json ./packages/persist/package.json
COPY packages/runner/package.json ./packages/runner/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/webapp/package.json ./packages/webapp/package.json
COPY package*.json  ./

# Install every dependencies
RUN true \
  && npm i

# At this stage we copy back all sources, nothing can be cached anymore
COPY . /app/tmp

ARG build_env
ARG git_hash
ENV GIT_HASH ${git_hash:-dev}

# /!\ It's counter intuitive but do not set NODE_ENV=production before building, it will break some modules
# ENV NODE_ENV=production

# Build
RUN true \
  && npm run ts-build:docker \
  && npm run webapp-build:${build_env:-staging}

# Clean src
RUN true \
  && rm -rf packages/*/src \
  && rm -rf packages/webapp/public \
  && rm -rf packages/webapp/node_modules

# Clean dev dependencies
RUN true \
  && npm prune --omit=dev --omit=peer --omit=optional

# ---- Web ----
# Resulting new, minimal image
# This image must have the minimum amount of layers
FROM node:18.19.1-bullseye-slim as web

ENV PORT=8080
ENV NODE_ENV=production

# - Bash is just to be able to log inside the image and have a decent shell
RUN true \
  && apt update && apt-get install -y bash ca-certificates \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false

# Do not use root to run the app
USER node

WORKDIR /app/nango

# Code
COPY --from=tmp --chown=node:node /app/tmp /app/nango

EXPOSE 8080
