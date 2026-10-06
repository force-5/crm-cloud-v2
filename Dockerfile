# Force 5 CRM — one image: the BFF serving /crm/api and the built SPA under /crm (plan §9 Deployment).
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@crm/web..." --filter "@crm/bff..."
RUN pnpm --filter @crm/web build \
 && pnpm --filter @crm/bff build \
 && pnpm --filter @crm/bff deploy --prod /out/bff

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8082 HOST=0.0.0.0 BASE_PATH=/crm WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /out/bff/node_modules ./node_modules
COPY --from=build /out/bff/package.json ./package.json
COPY --from=build /repo/apps/bff/dist ./dist
COPY --from=build /repo/apps/web/dist ./web
USER node
EXPOSE 8082
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8082/crm/api/health || exit 1
CMD ["node", "dist/server.js"]
