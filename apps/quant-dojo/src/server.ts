import index from "./frontend/index.html";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  development: process.env.NODE_ENV !== "production" && { hmr: true },
  routes: {
    "/": index,
  },
});

console.log(`quant-dojo → http://localhost:${server.port}`);
