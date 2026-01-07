FROM node:20-alpine AS build

USER 1000
WORKDIR /app
ENV NODE_ENV=production

COPY --chown=1000:1000 pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack prepare pnpm@10.27.0 --activate \
  && corepack pnpm fetch --prod

COPY --chown=1000:1000 package.json ./
COPY --chown=1000:1000 packages/server/package.json ./packages/server/package.json
RUN corepack pnpm install --prod --offline --frozen-lockfile

COPY --chown=1000:1000 packages/server ./packages/server

EXPOSE 3000
CMD ["corepack", "pnpm", "--filter", "token-bureau-server", "start"]
