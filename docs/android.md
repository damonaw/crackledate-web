# Android Release Notes

Last reviewed: June 10, 2026

## App Identity

- App name: `Crackle Date`
- Android package: `com.dissonantsynergy.crackledate`
- Version: `1.0.0`
- Initial version code: `1`
- Category: Games
- Subcategory: Puzzle
- Pricing: Free
- Accounts: None
- In-app purchases: None
- Ads: None in Android v1

## Local Behavior

The Android app is an Expo Native app under `apps/android/`. It uses `@crackledate/core` for puzzle
generation, editor helpers, equation evaluation, validation, and badge/stat helper logic.

Correct solves are written to local SQLite first. The app then adds an anonymous submission payload
to a local queue. Queue flushing is best-effort and runs when the app opens, resumes, or regains
connectivity. Upload failure must not block local gameplay.

## Privacy And Data Safety

Use the same privacy posture as iOS:

- Data collection: Gameplay Content
- Purpose: App functionality
- Linked to user: No
- Tracking: No
- Submitted payload: puzzle date, equation, solve seconds, difficulty, platform, app version
- Not submitted by app: account ID, name, email, device ID, advertising ID, precise location,
  payment information, or browser/app local storage contents

Keep Android v1 free of ads, accounts, login, in-app purchases, and tracking unless the app privacy
copy, Play Data Safety form, and repo guidance are reviewed together.

## Build And Submission

Run local verification first:

```bash
go test ./...
npm --workspace @crackledate/core test
npm --workspace @crackledate/core run build
npm --workspace @crackledate/android test
npm --workspace @crackledate/android run build
npm --workspace @crackledate/android run doctor
```

For local device QA, generate the native project and build an installable release APK with Java 17:

```bash
cd apps/android
npx expo prebuild --platform android --no-install
cd android
JAVA_HOME=$(/usr/libexec/java_home -v 17) \
  ANDROID_HOME=$HOME/Library/Android/sdk \
  ANDROID_SDK_ROOT=$HOME/Library/Android/sdk \
  ./gradlew :app:assembleRelease
```

The generated native project, Gradle outputs, and local Expo cache are ignored by git. Production
distribution should still use EAS rather than the locally debug-signed release APK.

Build the production Android App Bundle with EAS:

```bash
cd apps/android
npx eas-cli@latest build -p android --profile production
```

Submit only after a Play Console app exists for `com.dissonantsynergy.crackledate`, signing
credentials are configured, store listing assets are ready, and Play Data Safety is complete.

If the Play developer account is a personal account created after November 13, 2023, complete the
required closed test before applying for production access.
