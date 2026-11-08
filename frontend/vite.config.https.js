// Use for testing on a phone:  npm run dev:phone  ->  open https://<laptop-ip>:5173
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const api = "http://localhost:8000";
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { proxy: { "/auth": api, "/inspections": api, "/admin": api, "/uploads": api } },
});
