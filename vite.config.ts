import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // The optional Rive runtime is fetched only when an approved asset is configured.
        globIgnores: ["**/RiveBroadcastAsset-*.js"],
      },
      manifest: {
        name: "Rink Rivals",
        short_name: "Rink Rivals",
        description: "An unofficial hockey card rivalry prototype.",
        theme_color: "#08111f",
        background_color: "#050a12",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/rink-rivals-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/rink-rivals-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
