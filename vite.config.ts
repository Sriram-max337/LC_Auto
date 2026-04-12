import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleNodeGraphqlProxy } from "./server/proxy-graphql.mjs";

function graphqlProxyPlugin() {
  const mount = (
    server: import("vite").PreviewServer | import("vite").ViteDevServer
  ) => {
    server.middlewares.use((req, res, next) => {
      const path = req.url?.split("?")[0] ?? "";
      if (path !== "/api/graphql") {
        next();
        return;
      }
      void handleNodeGraphqlProxy(req, res);
    });
  };

  return {
    name: "leetcode-graphql-proxy",
    configureServer(server) {
      mount(server);
    },
    configurePreviewServer(server) {
      mount(server);
    },
  };
}

export default defineConfig({
  plugins: [react(), graphqlProxyPlugin()],
});
