import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Crackle Date',
  slug: 'crackle-date',
  owner: 'dissonant-synergy',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'crackledate',
  userInterfaceStyle: 'automatic',
  platforms: ['android'],
  android: {
    package: 'com.dissonantsynergy.crackledate',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#111827',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: '36.0.0',
        },
      },
    ],
  ],
  extra: {
    submissionsEndpoint: 'https://crackledate.com/api/submissions',
  },
};

export default config;
