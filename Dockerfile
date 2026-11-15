FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY astro.config.mjs tsconfig.json ./
COPY public ./public
COPY src ./src
RUN bun run build

FROM oven/bun:1
WORKDIR /app
COPY data/firms.sqlite /data/firms.sqlite
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
ENV HOST=0.0.0.0
ENV PORT=80
ENV FIRMS_DB=/data/firms.sqlite
EXPOSE 80
CMD ["bun", "./dist/server/entry.mjs"]
