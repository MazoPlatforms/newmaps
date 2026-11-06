# RideNow MapLibre Native example

Standalone Kotlin/Jetpack Compose example for the Rider and Driver map surface. It loads the production Mazo vector style directly; public read-only map APIs require no client secret.

To build, install Android SDK 35, JDK 17, and Gradle 8.9+ and run `gradle :app:assembleDebug` from this folder. Grant fine location permission to test GPS and local route requests. Search is debounced and cancels its prior OkHttp call; Route requests can be cancelled, and the sample shows offline/API/coverage errors. Style switching reloads the matching live light or dark style and reapplies the selected marker and route geometry.

The sample uses MapLibre Native Android `13.6.1`, Compose, and OkHttp. It does not modify or depend on the separate RideNow repository. It only renders the current Mazo place-vector coverage over a neutral background because no complete, licensed basemap archive is currently published. The app reports offline state and can show locally cached MapLibre resources; explicit downloadable offline-region management is not implemented here.
