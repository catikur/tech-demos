import index from "./frontend/index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production" && { hmr: true },
  routes: {
    "/": index,
  },
});

console.log(`life-loom → http://localhost:${server.port}`);
