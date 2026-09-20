FROM oven/bun:1.2
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PUBLIC_URL=https://atlas.conforcus.com
EXPOSE 3000

CMD ["bun", "run", "start"]
