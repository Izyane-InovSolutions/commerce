# Internal testing with Firebase App Distribution

Good for Goods goes to testers through Firebase App Distribution, in the
`good-for-goods` Firebase project. App Distribution itself needs nothing in the
app, only the built APK and IPA; the Firebase SDK in the Android build is there
for Analytics. `tool/distribute.sh` builds and uploads.

| | Android | iOS |
|---|---|---|
| App id | `com.izyane.commerce_mobile` | `com.izyane.commerceMobile` |
| Build | Release APK | Ad hoc IPA (Xcode's "release testing") |
| Who can install | Anyone invited | Invited testers whose device is registered with Apple |

## One-time setup

1. **The Firebase project** is `good-for-goods`. The Android app
   (`com.izyane.commerce_mobile`) is already registered, and its
   `google-services.json` is in `android/app/`.
2. **Add the iOS app** under Project settings → Your apps, with bundle ID
   `com.izyane.commerceMobile`. App Distribution doesn't need its
   `GoogleService-Info.plist`, but Firebase Analytics on iOS will. Put it in
   `ios/Runner/` and add it to the Runner target in Xcode when it's time.
3. **Open App Distribution**, and under Testers & Groups create a group called
   `internal-testers`. Add testers by email.
4. **Install and sign in to the Firebase CLI** on the machine that builds:

   ```sh
   npm install -g firebase-tools
   firebase login
   ```

5. **Fill in the settings:**

   ```sh
   cp tool/distribution.env.example tool/distribution.env
   ```

   The Android app ID is already filled in; add the iOS one once that app is
   registered. The file is git-ignored.
6. **Android upload key:** create it once, then share it with everyone who
   uploads builds.

   ```sh
   keytool -genkey -v -keystore ~/keys/goodforgoods-upload.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   cp android/key.properties.example android/key.properties   # then fill it in
   ```

   A build signed with a different key can't update one testers already have;
   they'd have to uninstall first. Keep the `.jks` file and its passwords
   somewhere safe, outside the repository. `key.properties` and `*.jks` are
   git-ignored.
7. **iOS:**
   - The builds are signed by team `A6J69MLA7W`, set in the Xcode project and
     `ios/ExportOptions-AdHoc.plist`.
   - Register the bundle ID `com.izyane.commerceMobile` in the Apple Developer
     account, if it isn't already. Xcode's automatic signing does this the
     first time you open `ios/Runner.xcworkspace` and build once.

## Sending a build

```sh
API_BASE_URL=https://<current-tunnel>.trycloudflare.com/api/v1 tool/distribute.sh all
```

`android` or `ios` sends to one platform only.

**What the script does:**
- Checks that the API answers.
- Builds with the next build number (the commit count), so every upload
  counts as an update.
- Points the build at `API_BASE_URL`.
- Uploads the build to the `internal-testers` group, with release notes
  listing the build number, commit, API address and recent changes.

**Which build a tester has:** it's shown at the bottom of Account, for example
"Good for Goods, 212 (a1b2c3d)". Ask for it with every bug report.

**The API address:** the internal-testing API sits behind a Cloudflare quick
tunnel, and its address changes whenever the tunnel restarts. A tester can
repoint the app under Account → Server without a new build. Send a new build
when the address changes for good, or once the API has a fixed hostname.

## Updates inside the app

Testers can check for and install new builds from **Account → About this
app**. That screen also shows the installed version and build number. The
in-repo plugin `packages/app_update` wraps Firebase App Distribution's tester
SDK:

- **Android:** the SDK downloads the new APK in the app and hands it to the
  system installer.
- **iOS:** the SDK finds the release and opens its install page.
- **Sign-in:** the first check asks the tester to sign in to App
  Distribution with their tester email. After that, each launch checks quietly
  and shows a notice with an **Update** button when a newer build is waiting.
  Until they've signed in by hand, the launch check stays quiet, so nobody
  gets a sign-in page they didn't ask for.
- **The iOS sign-in callback:** it returns to the app through the URL scheme
  `app-1-538169518184-ios-b29f728e93feb7224073dd` in `Info.plist`. That's the
  iOS app's encoded app ID; change it if the Firebase iOS app changes.

**Firebase App Testers API:** in-app updates need this Google Cloud API
enabled for the `good-for-goods` project. If a check says in-app updates are
switched off, enable it in the Google Cloud console and try again.

**Before a store release**, the self-updating SDKs must come out: Google Play
and the App Store both forbid apps that update themselves.

- **Android:** build with `-PstoreBuild=true`, for example
  `flutter build appbundle -PstoreBuild=true`. This keeps only App
  Distribution's no-op API library, and the app then says updates come
  through the store.
- **iOS:** remove the `FirebaseAppDistribution-Beta` product from
  `packages/app_update/ios/app_update/Package.swift`, or drop the plugin, for
  the App Store build.

## Adding an iOS tester

Ad hoc builds only install on devices registered with the Apple Developer
account. Registration is per device, not per person.

1. Invite the tester to the group. The App Distribution email walks them
   through registering their device, and Firebase shows you its UDID under
   Testers & Groups.
2. Add the UDID in the Apple Developer account, under Certificates, IDs &
   Profiles → Devices. The Firebase console can export the list for bulk
   upload.
3. Run `tool/distribute.sh ios` again. Automatic signing puts the new device
   in the provisioning profile, and the tester can install.

Android testers need none of this.

## Changing the brand assets

The app icon, the Android adaptive icon and the launch screens are rendered
from the design system by `tool/render_brand_test.dart`, using the app's own
font and palette. `tool/brand_assets.sh` then sizes them and puts them in
place. After changing the mark, the name or the palette, run:

```sh
tool/brand_assets.sh
```

**What shows at launch:**
- **iOS, and Android before 12:** "Good for Goods, by iZyane" on the page
  colour, in light and dark versions.
- **Android 12 and later:** the system's own splash shows the app icon, and
  the app's splash follows with the full wordmark.

In every case the app's splash draws the wordmark at the same size and
position as the native one, so the hand-over doesn't jump.
