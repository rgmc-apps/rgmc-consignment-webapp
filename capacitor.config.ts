import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rgmc.consignment',
  appName: 'RGMC Consignment - Garments',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
