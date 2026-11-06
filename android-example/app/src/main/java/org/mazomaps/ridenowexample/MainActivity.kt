package org.mazomaps.ridenowexample

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.components.LocationComponentActivationOptions
import org.maplibre.android.location.modes.CameraMode
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.iconAllowOverlap
import org.maplibre.android.style.layers.PropertyFactory.iconAnchor
import org.maplibre.android.style.layers.PropertyFactory.iconImage
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

private const val MAP_API = "https://maps.mazo.workers.dev/api/v1"
private val http = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()
private val jsonMedia = "application/json; charset=utf-8".toMediaType()

private data class Place(val id: String, val name: String, val address: String?, val lon: Double, val lat: Double)
private data class RouteSummary(val distanceMeters: Double, val durationSeconds: Double, val line: LineString)
private data class ApiResult(val status: Int, val body: String, val retryAfter: String?)

private suspend fun execute(request: Request): ApiResult = suspendCancellableCoroutine { continuation ->
    val call = http.newCall(request)
    continuation.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
        override fun onFailure(call: Call, error: IOException) {
            if (continuation.isActive) continuation.resumeWithException(error)
        }
        override fun onResponse(call: Call, response: Response) {
            response.use {
                val result = ApiResult(it.code, it.body?.string().orEmpty(), it.header("Retry-After"))
                if (continuation.isActive) continuation.resume(result)
            }
        }
    })
}

private fun placeFrom(json: JSONObject): Place? {
    val coordinates = json.optJSONArray("coordinates") ?: return null
    if (coordinates.length() < 2) return null
    return Place(json.optString("id"), json.optString("name"), json.optString("address").ifBlank { null },
        coordinates.optDouble(0, Double.NaN), coordinates.optDouble(1, Double.NaN))
        .takeIf { it.id.isNotBlank() && it.name.isNotBlank() && it.lon.isFinite() && it.lat.isFinite() }
}

private suspend fun search(query: String): List<Place> {
    val url = "$MAP_API/places/search?q=${java.net.URLEncoder.encode(query, "UTF-8")}&limit=10"
    val response = execute(Request.Builder().url(url).header("Accept", "application/json").get().build())
    if (response.status == 429) throw IOException("Rate limited. Retry after ${response.retryAfter ?: "60"} seconds.")
    if (response.status !in 200..299) throw IOException("Search returned HTTP ${response.status}.")
    val results = JSONObject(response.body).optJSONArray("results") ?: JSONArray()
    return (0 until results.length()).mapNotNull { placeFrom(results.getJSONObject(it)) }
}

private suspend fun route(startLon: Double, startLat: Double, destination: Place, profile: String): RouteSummary {
    val input = JSONObject().put("start_lon", startLon).put("start_lat", startLat)
        .put("end_lon", destination.lon).put("end_lat", destination.lat).put("profile", profile)
    val request = Request.Builder().url("$MAP_API/route").header("Accept", "application/json")
        .post(input.toString().toRequestBody(jsonMedia)).build()
    val response = execute(request)
    val body = JSONObject(response.body)
    if (response.status == 429) throw IOException("Rate limited. Retry after ${response.retryAfter ?: "60"} seconds.")
    if (response.status == 422) throw IOException("Outside local Kattankudy route coverage (${body.optString("error")}).")
    if (response.status !in 200..299) throw IOException("Routing returned HTTP ${response.status}.")
    val first = body.getJSONArray("routes").getJSONObject(0)
    return RouteSummary(first.getDouble("distance"), first.getDouble("duration"),
        LineString.fromJson(first.getJSONObject("geometry").toString()))
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        MapLibre.getInstance(applicationContext)
        setContent { MaterialTheme { RideNowMapScreen() } }
    }
}

@Composable
private fun RideNowMapScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var dark by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var routeLoading by remember { mutableStateOf(false) }
    var routeJob by remember { mutableStateOf<Job?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Place?>(null) }
    var profile by remember { mutableStateOf("driving") }
    var routeSummary by remember { mutableStateOf<RouteSummary?>(null) }
    val results = remember { mutableStateListOf<Place>() }
    var online by remember { mutableStateOf(isOnline(context)) }

    fun applyPlace(style: Style, place: Place?) {
        if (place == null) return
        val feature = Feature.fromGeometry(Point.fromLngLat(place.lon, place.lat))
        feature.addStringProperty("id", place.id)
        feature.addStringProperty("name", place.name)
        val collection = FeatureCollection.fromFeatures(arrayOf(feature))
        val source = style.getSourceAs<GeoJsonSource>("ridenow-selected")
        if (source == null) {
            style.addSource(GeoJsonSource("ridenow-selected", collection))
            style.addLayer(SymbolLayer("ridenow-selected-symbol", "ridenow-selected").withProperties(
                iconImage("place"), iconAnchor(Property.ICON_ANCHOR_BOTTOM), iconAllowOverlap(true)))
        } else source.setGeoJson(collection)
    }

    fun applyRoute(style: Style, line: LineString?) {
        val features = if (line == null) emptyArray() else arrayOf(Feature.fromGeometry(line))
        val collection = FeatureCollection.fromFeatures(features)
        val source = style.getSourceAs<GeoJsonSource>("ridenow-route")
        if (source == null) {
            style.addSource(GeoJsonSource("ridenow-route", collection))
            style.addLayer(LineLayer("ridenow-route-line", "ridenow-route").withProperties(
                lineColor(if (dark) "#47c2ae" else "#087f8c"), lineWidth(5f)))
        } else source.setGeoJson(collection)
    }

    fun loadStyle() {
        map?.setStyle(Style.Builder().fromUri(if (dark) "$MAP_API/style/dark.json" else "$MAP_API/style.json")) { style ->
            applyPlace(style, selected)
            applyRoute(style, routeSummary?.line)
        }
    }

    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) { error = "Location permission was denied; map and search remain available."; return@rememberLauncherForActivityResult }
        val currentMap = map ?: return@rememberLauncherForActivityResult
        val style = currentMap.style ?: return@rememberLauncherForActivityResult
        val component = currentMap.locationComponent
        if (!component.isLocationComponentActivated) {
            component.activateLocationComponent(LocationComponentActivationOptions.builder(context, style).build())
        }
        component.isLocationComponentEnabled = true
        component.cameraMode = CameraMode.TRACKING
        error = null
    }

    LaunchedEffect(dark) { loadStyle() }
    LaunchedEffect(query) {
        if (query.isBlank()) { results.clear(); error = null; return@LaunchedEffect }
        delay(300)
        loading = true
        try { results.clear(); results.addAll(search(query)); error = null }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { error = failure.message ?: "Search is unavailable." }
        finally { loading = false }
    }
    LaunchedEffect(Unit) {
        while (true) { online = isOnline(context); delay(5_000) }
    }

    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(query, { query = it }, Modifier.weight(1f), label = { Text("Search places") }, singleLine = true)
                Button(onClick = { dark = !dark }) { Text(if (dark) "Light" else "Dark") }
            }
            if (!online) Text("Offline: network search/routing is unavailable; only locally cached map resources may appear.",
                Modifier.fillMaxWidth().padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.error)
            if (loading) Text("Searching…", Modifier.padding(horizontal = 12.dp))
            error?.let { Text(it, Modifier.fillMaxWidth().padding(horizontal = 12.dp), color = MaterialTheme.colorScheme.error) }
            LazyColumn(Modifier.height(if (results.isEmpty()) 0.dp else 130.dp)) {
                items(results, key = { it.id }) { place ->
                    PlaceRow(place.name, place.address.orEmpty()) {
                        selected = place
                        error = null
                        map?.let { current ->
                            current.animateCamera(CameraUpdateFactory.newLatLngZoom(org.maplibre.android.geometry.LatLng(place.lat, place.lon), 15.0))
                            current.style?.let { applyPlace(it, place) }
                        }
                    }
                }
            }
            AndroidView(modifier = Modifier.weight(1f).fillMaxWidth(), factory = { viewContext ->
                MapView(viewContext).also { view ->
                    view.onCreate(null)
                    view.getMapAsync { ready -> map = ready; mapView = view; loadStyle() }
                }
            }, update = { mapView = it })
            Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                        val currentMap = map
                        val style = currentMap?.style
                        if (currentMap != null && style != null) {
                            val component = currentMap.locationComponent
                            if (!component.isLocationComponentActivated) component.activateLocationComponent(LocationComponentActivationOptions.builder(context, style).build())
                            component.isLocationComponentEnabled = true
                            component.cameraMode = CameraMode.TRACKING
                        }
                    } else locationPermission.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                }) { Text("GPS") }
                Button(onClick = { profile = "driving" }) { Text("Drive") }
                Button(onClick = { profile = "walking" }) { Text("Walk") }
                Button(onClick = { profile = "cycling" }) { Text("Cycle") }
                Button(onClick = {
                    val destination = selected
                    val currentMap = map
                    val location = currentMap?.locationComponent?.lastKnownLocation
                    if (destination == null) { error = "Search and select a destination first."; return@Button }
                    if (location == null) { error = "Enable GPS or choose a current location before routing."; return@Button }
                    routeJob?.cancel()
                    routeJob = scope.launch {
                        routeLoading = true
                        try {
                            val result = route(location.longitude, location.latitude, destination, profile)
                            routeSummary = result
                            map?.style?.let { applyRoute(it, result.line) }
                            error = "${result.distanceMeters.toInt()} m · about ${(result.durationSeconds / 60).toInt()} min · local estimate"
                        } catch (cancelled: CancellationException) { error = "Route cancelled."; throw cancelled }
                        catch (failure: Exception) { error = failure.message ?: "Route unavailable." }
                        finally { routeLoading = false }
                    }
                }) { Text("Route") }
                if (routeLoading) Button(onClick = { routeJob?.cancel(); error = "Route cancelled." }) { Text("Cancel") }
            }
        }
    }

    DisposableEffect(mapView) {
        mapView?.onStart(); mapView?.onResume()
        onDispose { mapView?.onPause(); mapView?.onStop(); mapView?.onDestroy() }
    }
}

private fun isOnline(context: Context): Boolean {
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
    val network = manager.activeNetwork ?: return false
    return manager.getNetworkCapabilities(network)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
}

@Composable
private fun PlaceRow(title: String, subtitle: String, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 2.dp)) {
        Column(Modifier.fillMaxWidth()) { Text(title); if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.labelSmall) }
    }
}
