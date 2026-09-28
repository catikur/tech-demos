const api = Bun.spawn(["bun", "--hot", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

const web = Bun.spawn(["bunx", "vite"], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

function shutdown() {
  api.kill();
  web.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const apiExit = await api.exited;
const webExit = await web.exited;
process.exit(apiExit || webExit);
