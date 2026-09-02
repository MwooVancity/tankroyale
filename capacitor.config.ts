import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.tankroyale',
  appName: 'Tank Royale',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // serverClientId is set via google-services.json — do not hardcode here
      forceCodeForRefreshToken: false,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#05080b',
      showSpinner: false,
    },
  },
};

export default config;
