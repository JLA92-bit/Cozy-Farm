import type { CapacitorConfig } from '@capacitor/cli';

// 1.32 the Android app (android/README.md): the game's files from `npm run build:app` (dist-app) inside the app.
const config: CapacitorConfig = {
  appId: 'app.joshmakesgames.cozyacres',
  appName: 'Cozy Acres',
  webDir: 'dist-app',
  backgroundColor: '#8fd3f4',
  android: {
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // full screen like the web app (swipe from an edge to show the bars); the notch and rounded corners still come
    // through as --safe-area-inset-* for the HUD (src/ui/styles.css)
    SystemBars: { hidden: true, insetsHandling: 'css' },
  },
};

export default config;
