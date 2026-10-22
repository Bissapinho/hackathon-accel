# Mini-Foundry / Swain: API server + web client in one image (Aiven App Runtime, or any container host).
# The web client listens on $PORT (public) and proxies /api to the API server on 127.0.0.1:4000.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY build-package ./build-package
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["sh", "scripts/docker-start.sh"]
