import index from "./index.html";

const port = Number(process.env.PORT ?? 4173);
const production = process.env.NODE_ENV === "production";

Bun.serve({
  port,
  hostname: "0.0.0.0",
  routes: {
    "/": index,
  },
  development: production
    ? false
    : {
        hmr: true,
        console: true,
      },
});

console.log(`social-crew http://localhost:${port}`);
