/// <reference lib="webworker" />
// Workbox route callbacks below are serialized and executed in the worker.
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { resolvePapiWebsiteUrl } from './src/lib/public-integration-config';

// https://vitejs.dev/config/ – env reload
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const stripBom = (value: string | undefined) => (value ?? "").replace(/^\uFEFF/, "").trim();

  const supabaseUrl =
    stripBom(env.VITE_SUPABASE_URL) ||
    "https://eudwjgdijylsgcnncxeg.supabase.co";
  const supabasePublishableKey =
    stripBom(env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1ZHdqZ2Rpanlsc2djbm5jeGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTI5OTAsImV4cCI6MjA4NzA4ODk5MH0.9BknkyJShiVQgTBuO-Ulx9eTgrERxxzLth0-E0_Y8IU";
  const supabaseProjectId = stripBom(env.VITE_SUPABASE_PROJECT_ID) || "eudwjgdijylsgcnncxeg";
  const websiteUrl = resolvePapiWebsiteUrl(stripBom(env.VITE_PAPI_WEBSITE_URL));

  return {
    define: {
      "import.meta.env.VITE_PAPI_WEBSITE_URL": JSON.stringify(websiteUrl),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-supabase": ["@supabase/supabase-js"],
            "vendor-query": ["@tanstack/react-query"],
            "vendor-ui": ["sonner", "recharts", "lucide-react"],
          },
        },
      },
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["favicon.ico", "placeholder.svg", "pwa-icon-192.png", "pwa-icon-512.png"],
        workbox: {
          navigateFallbackDenylist: [/^\/~oauth/],
          importScripts: ["/sw-private-cache.js"],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => /^\/(rest|auth)\/v1\//.test(url.pathname),
              handler: "NetworkOnly",
              options: { fetchOptions: { cache: "no-store" } },
            },
            {
              urlPattern: ({ url }) => url.origin === self.location.origin && /\.(js|css|png|jpg|jpeg|svg|gif|woff2?)$/i.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
        manifest: {
          name: "PAPI HAIR DESIGN – Booking",
          short_name: "PHD Booking",
          description: "Moderný a rýchly rezervačný systém pre PAPI HAIR DESIGN",
          start_url: "/booking",
          display: "standalone",
          orientation: "portrait",
          background_color: "#0b0b0b",
          theme_color: "#0b0b0b",
          categories: ["business", "lifestyle"],
          icons: [
            { src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          screenshots: [],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
