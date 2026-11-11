# Mazo Maps Android SDK

The lightweight Kotlin SDK connects Rider and Driver apps to Mazo Maps' self-hosted MapLibre Native styles, vector places, search, geocoding, route API, GPS layer, and offline map regions. It does not use Google Maps services, API keys, or place-data credentials.

## What it contains

- Native MapLibre vector rendering from Mazo's `/api/v1/style.json` and `/api/v1/tiles.json` endpoints. MapLibre requests PBF tiles individually; the SDK does not download a PMTiles archive into app memory.
- A sparse dot-to-pin transition, readable place labels, collision handling while exploring, and all loaded POI pins at zoom 18 and above.
- Suspend Kotlin clients for place search, geocoding, and driving, walking, and cycling routes, including route alternatives and snap/coverage errors.
- A route-line renderer, tap-to-place references, GPS activation after the host app grants Android location permission, and native MapLibre offline tile regions.
- No Compose dependency in the library. Compose apps can host the same MapLibre `MapView` through `AndroidView`.

The published web dataset contains about 65,000 places. MapLibre collision placement may hide overlapping symbols while zoomed out; at zoom 18+ the SDK turns icon collisions off so every eligible pin in the loaded map area can render. Names still use collision placement to keep dense streets legible.

## Add the module

This repository contains the SDK source module; it is not yet published to Maven Central. In an Android app that checks out this repository beside the app project, add the module to `settings.gradle.kts`:

```kotlin
include(":mazo-android-sdk")
project(":mazo-android-sdk").projectDir = file("../newmaps/android-sdk/android-sdk")
```

Then add to the app module's `build.gradle.kts`:

```kotlin
dependencies {
    implementation(project(":mazo-android-sdk"))
}
```

The SDK is configured for `minSdk 23`, `compileSdk 35`, Android Gradle Plugin 8.8.2, Kotlin 2.0.21, MapLibre Native Android 11.8.0, and coroutines 1.9.0. Internet access is required for online map tiles and APIs. The app must request location permission at runtime before enabling GPS.

## MapLibre View and Jetpack Compose

Initialize MapLibre once in the application and load the self-hosted style. Install the POI layers in the style callback after each light/dark style change.

```kotlin
val options = MazoMapOptions(theme = MazoTheme.LIGHT)
val client = MazoMapsClient()

mapView.getMapAsync { map ->
    map.setStyle(options.styleUrl()) { style ->
        val controller = MazoMapController.install(map, style)
        controller.onPlaceTap = { place ->
            lifecycleScope.launch {
                val selected = client.searchPlaces(place.name, limit = 1).firstOrNull()
                // Open the Rider destination or Driver pickup/drop-off UI.
            }
        }
    }
}
```

Compose hosts the native view; forward lifecycle events to `MapView` in the app (or its lifecycle-aware wrapper):

```kotlin
@Composable
fun MazoMapSurface(onReady: (MapView) -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val view = remember { MapView(context).also { it.onCreate(null) } }
    AndroidView(factory = { view }, modifier = Modifier.fillMaxSize())
    LaunchedEffect(view) { onReady(view) }
    DisposableEffect(view) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> view.onStart()
                Lifecycle.Event.ON_RESUME -> view.onResume()
                Lifecycle.Event.ON_PAUSE -> view.onPause()
                Lifecycle.Event.ON_STOP -> view.onStop()
                Lifecycle.Event.ON_DESTROY -> view.onDestroy()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
}
```

Keep the returned `MazoMapController` for the current style. Call `controller.close()` before replacing the style/controller so map listeners are removed. Use `MazoTheme.DARK` for the dark style; the map remains north-up by default.

## Search, geocoding, GPS, and routes

```kotlin
lifecycleScope.launch {
    val matches = client.searchPlaces("Kattankudy", limit = 8)
    val addressMatches = client.geocode("Central College Kattankudy", limit = 5)

    try {
        val result = client.route(
            start = MazoCoordinate(81.7300, 7.6800),
            destination = MazoCoordinate(81.7400, 7.6800),
            profile = MazoRouteProfile.DRIVING,
        )
        result.routes.firstOrNull()?.let(controller::drawRoute)
    } catch (error: MazoApiException) {
        // Use error.code, error.coverage and snap distances to explain a
        // coverage/snap failure; do not draw a fabricated fallback route.
    }
}
```

`MazoMapController.enableLocation(context, style, permissionGranted = true)` activates MapLibre's location component. Only call it after your app requests `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION` at runtime. `disableLocation()` turns it off. The SDK does not request or retain location permission itself.

The route response includes geometry, distance, duration estimate, snap distances, turn instructions, alternatives, and coverage. The current road graph and routing API cover the Kattankudy area only. Requests outside that graph return a coverage/snap error; map coverage does not imply route coverage.

## Offline maps

`MazoOfflineRegions.download(bounds, theme, minZoom, maxZoom, pixelRatio, ...)` uses MapLibre's offline region store to download the selected self-hosted style, glyphs, and map tiles to the device. Save the returned region ID, pause/resume with `MazoOfflineRegion`, and delete the region when the user removes the download. Keep zoom bounds small enough for the device's storage and MapLibre tile limits.

Offline regions cover map rendering. Search, geocoding, and routing methods call the hosted API and need connectivity; this initial SDK does not claim offline place search or offline routing. The web app's offline pack is a separate browser feature.

## Stable endpoints and behavior

| Purpose | Endpoint |
| --- | --- |
| Light/dark MapLibre styles | `GET /api/v1/style.json`, `GET /api/v1/style/dark.json` |
| Place TileJSON | `GET /api/v1/tiles.json` |
| MVT tiles | `GET /api/v1/tiles/{z}/{x}/{y}.pbf` |
| Place search | `GET /api/v1/places/search?q=...&limit=...` |
| Geocoding | `GET /api/v1/geocode?q=...&limit=...` |
| Routing | `POST /api/v1/route` with start/end longitude, latitude, and `profile` |
| API/data manifest | `GET /api/v1/manifest` |

Vector tiles are XYZ PBF, gzip-compressed when negotiated, and use public immutable revisioned caching and ETags. Search/routing JSON have separate rate limits from vector tile traffic. Read-only APIs are public and require no client secret. Keep all future write credentials on a trusted server.

Android apps should preserve API status/error fields, surface 429 retry information, cancel requests when a screen is disposed, and avoid retry loops. `MazoMapsClient` uses bounded connect/read timeouts and `Dispatchers.IO`.

## Build and verification

```sh
cd android-sdk
gradle --no-daemon :android-sdk:testDebugUnitTest :android-sdk:assembleRelease
```

The `Validate Mazo Maps Android SDK` GitHub Actions workflow runs both commands on Android SDK/Java 17. Unit tests cover default style URLs, coordinate validation, and rejecting insecure hosted URLs. Browser tests cover dot/pin/name zoom transitions and verify that collision suppression is disabled at maximum zoom. Production routing remains limited by the currently published Kattankudy road graph.
