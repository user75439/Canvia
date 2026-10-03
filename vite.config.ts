import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Cloudflare Quick Tunnel меняет поддомен при каждом запуске,
    // поэтому разрешаем любой *.trycloudflare.com
    allowedHosts: ['.trycloudflare.com'],
    // Прокси API через тот же origin: снаружи доступен только порт туннеля,
    // а :5000 закрыт — /api уходит на локальный бэкенд
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
