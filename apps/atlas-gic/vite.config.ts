import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5199,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5200",
        timeout: 300_000,
      },
    },
  },
});
