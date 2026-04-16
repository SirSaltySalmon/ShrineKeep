import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Next.js + Capacitor: Capacitor wants a static webDir with index.html (this repo uses `www/`).
 * This app uses Next.js API routes and server features, so you cannot point `webDir` at a
 * plain `next build` output. Use one of:
 *
 * 1) Development / quick native shell: set CAPACITOR_DEV_SERVER_URL (e.g. http://192.168.1.10:3000)
 *    so the WebView loads your running `next dev` / deployed URL. Use your machine's LAN IP
 *    so a physical device can reach the dev server.
 *
 * 2) Fully offline native bundle: add `output: "export"` and satisfy static export constraints
 *    (no Route Handlers in the exported surface, `images.unoptimized`, etc.), build to `out`,
 *    then set webDir to `out` instead of `www`.
 */
const devServerUrl = process.env.CAPACITOR_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.shrinekeep.app",
  appName: "ShrineKeep",
  webDir: "www",
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: devServerUrl.startsWith("http:"),
        },
      }
    : {}),
};

export default config;
