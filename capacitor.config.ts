import type { CapacitorConfig } from '@capacitor/cli';

// 1.32 the Android app (android/README.md): the game's files from `npm run build:app` (dist-app) inside the app.
const config: CapacitorConfig = {
  appId: 'app.joshmakesgames.cozyacres',
  appName: 'Cozy Acres',
  webDir: 'dist-app',
  backgroundColor: '#8fd3f4',
  // NEVER CHANGE these three (they are Capacitor 8's defaults, written out so nobody changes them by accident): the
  // farm save and the sign-in live in the web view's storage for this address (https://localhost on Android,
  // capacitor://localhost on iPhone). Store updates keep it; a different address would start every player on an empty
  // farm, signed out, like the move from the old Play app did.
  server: { androidScheme: 'https', hostname: 'localhost', iosScheme: 'capacitor' },
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
