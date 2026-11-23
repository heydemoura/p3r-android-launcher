# Reload Home

An Android home-screen launcher adapted from the Persona 3 Reload Tizen menu. The portrait layout reframes the original animated scene around a touch-operated app list. Landscape uses the widescreen scene.

## On your phone

Download the signed APK from [GitHub Releases](https://github.com/heydemoura/p3r-android-launcher/releases/latest), install it, and open **Reload Home**. Hold anywhere on its home screen to open **System**. Tap **Default home app** to choose a launcher in Android settings.

- On Home, swipe up or down to move the highlight. Keep dragging to move through several entries. In System and its submenus, tap controls directly, tap text fields to edit, and drag to scroll long lists.
- Opening Home plays the recorded water splash and character descent. Horizontal swipes carry the neighboring page with your finger. System and its submenus use the blue ink reveal on entry and the two-circle reveal on Back. Enable **Reduced motion** for instant transitions.
- Tap an app name or icon on Home to launch that app immediately. Tap the background to open the highlighted item.
- Home uses the independent page lists you set in **System → Apps**. Swipe vertically through longer lists. Swipe left for the next page or right for the previous one. The page arrows do the same. Each page includes System, and the launcher remembers the last page you opened.
- Tap the **App drawer** button at the lower left of any Home page to browse launchable apps by letter. Drag the right-hand index to jump, scroll the grid, or type an app name. Under **System → App drawer**, turn off **Show app drawer button on Home** to hide it on every page. You can independently enable **Swipe up to open app drawer** (off by default). With it enabled, a downward swipe still moves the selection. The same settings control drawer visibility, the recent-app row, and its count (five by default). Successful launches from Reload Home populate Recents. Enable Android usage access there to include personal-profile apps opened elsewhere during the last 90 days.
- Under **Customization**, choose a preset accent or enter a six-digit hex color. Background animation, reduced motion, app icons, navigation sounds and background sound each have a switch. The phone’s media volume controls both the Tizen menu cues and the quieter background loop. The loop pauses when you leave the launcher and yields to other media. Reduced motion also disables menu transitions.
- Under **Apps**, choose a page or tap **+ Add page**. Check or uncheck apps for that page. Each list follows selection order, and an app can appear on multiple pages. Empty pages are kept. You can remove a page from its editor when at least one other page exists. Updating from 1.2 converts the old six-app groups into editable lists.

## Build

Use JDK 17 or 21, Android SDK Platform 36, Build Tools 35.0.0 or later, and an updated Android System WebView on the device. The minimum Android version is 8.0 (API 26). Point ANDROID_HOME to the SDK or set sdk.dir in local.properties.

Run `./gradlew assembleDebug` for an installable development build. The APK is in `app/build/outputs/apk/debug/`. Run `./gradlew assembleRelease` to build the unsigned release APK, then sign it with your own Android signing key.

## Publishing a release

Publish a GitHub Release with a version tag such as `v0.1.0`. The Release APK workflow builds the tagged source, signs the APK, verifies its signature and alignment, and attaches it to the release. Increment `versionCode` in `app/build.gradle` for each Android update. The tag supplies the public APK version name.

The workflow reads two repository Actions secrets. `APK_KEYSTORE_BASE64` contains the base64-encoded release PKCS#12 keystore and `APK_STORE_PASSWORD` contains its password. Use the same signing identity for updates.

## License

The original Android launcher code and interface adaptations are licensed under the GNU General Public License, version 3 only (GPL-3.0-only). See [LICENSE](LICENSE). Game-derived assets retain their third-party attributions, and the bundled fonts use the SIL Open Font License. See the [asset notices](app/src/main/assets/licenses/NOTICE) and [font license](app/src/main/assets/licenses/FONTS.txt).

## Source and assets

HomeActivity uses Android LauncherApps for app discovery and launching. The bundled interface runs locally in WebView. Menu choices and customization are stored in the app’s private preferences.

The Tizen source for the graphics and sound is heydemoura/p3r-tizen-launcher, revision 9420945. This adaptation includes portrait and landscape encodings of its clean home animation, a System backdrop, menu sounds, and fonts. The app drawer adapts the Quest menu at 74.1 seconds in the menu recording, including its clean Quest scene, angled title and blue panel. The one-shot splash uses frames 28–59 of the project’s clean menu recording. The wipe outline and timing were sampled from the System and Config sequences in its menu recording (98.17–98.60, 105.58–105.88 and 115.67–115.90 seconds). The horizontal page slide adapts that pacing to touch. The background loop is an eight-bar edit of the supplied menu recording with recorded navigation cues attenuated. See LICENSE and app/src/main/assets/licenses for credits and third-party notices.
