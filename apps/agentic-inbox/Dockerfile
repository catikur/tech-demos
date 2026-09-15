FROM oven/bun:1.4
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
ENV LOGIN_REQUIRED=1
ENV ALLOWED_LOGIN_DOMAIN=conforcus.com
EXPOSE 3000
CMD ["bun", "run", "start"]
