package com.mazoplatforms.mazomaps

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.job
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Public, read-only Mazo Maps APIs. No client token or secret is required. */
class MazoMapsClient(
    baseUrl: String = DEFAULT_BASE_URL,
    private val connectTimeoutMillis: Int = 8_000,
    private val readTimeoutMillis: Int = 15_000,
) {
    private val baseUrl = baseUrl.trimEnd('/')

    init {
        require(this.baseUrl.startsWith("https://") || this.baseUrl.startsWith("http://localhost")) {
            "Use HTTPS for hosted map services."
        }
        require(connectTimeoutMillis in 1..60_000 && readTimeoutMillis in 1..120_000)
    }

    fun styleUrl(theme: MazoTheme = MazoTheme.LIGHT): String = apiUrl(baseUrl, theme.stylePath)

    suspend fun searchPlaces(query: String, limit: Int = 10): List<MazoPlace> {
        require(query.isNotBlank() && query.length <= 120) { "Search query must contain 1..120 characters." }
        require(limit in 1..25) { "Search limit must be within 1..25." }
        val result = request("/api/v1/places/search?q=${encode(query)}&limit=$limit")
        return result.optJSONArray("results").toPlaces()
    }

    suspend fun geocode(query: String, limit: Int = 10): List<MazoPlace> {
        require(query.isNotBlank() && query.length <= 120) { "Geocoding query must contain 1..120 characters." }
        require(limit in 1..25) { "Geocoding limit must be within 1..25." }
        val result = request("/api/v1/geocode?q=${encode(query)}&limit=$limit")
        val features = result.optJSONArray("features") ?: return emptyList()
        return (0 until features.length()).mapNotNull { index ->
            val feature = features.optJSONObject(index) ?: return@mapNotNull null
            val properties = feature.optJSONObject("properties") ?: return@mapNotNull null
            val coordinates = feature.optJSONObject("geometry")?.optJSONArray("coordinates")
            properties.toPlace(coordinates)
        }
    }

    suspend fun route(
        start: MazoCoordinate,
        destination: MazoCoordinate,
        profile: MazoRouteProfile = MazoRouteProfile.DRIVING,
    ): MazoRouteResult {
        val body = JSONObject()
            .put("start_lon", start.longitude).put("start_lat", start.latitude)
            .put("end_lon", destination.longitude).put("end_lat", destination.latitude)
            .put("profile", profile.wireValue)
        val response = request("/api/v1/route", body)
        val alternatives = response.optJSONArray("routes") ?: JSONArray()
        return MazoRouteResult(
            revision = response.optNullableString("revision"),
            coverage = response.optNullableString("coverage"),
            routes = (0 until alternatives.length()).mapNotNull { alternatives.optJSONObject(it)?.toRoute(profile) },
        )
    }

    private suspend fun request(path: String): JSONObject = openRequest(path)

    private suspend fun request(path: String, body: JSONObject): JSONObject = openRequest(path, body)

    private suspend fun openRequest(path: String, body: JSONObject? = null): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL("$baseUrl$path").openConnection() as HttpURLConnection
        connection.connectTimeout = connectTimeoutMillis
        connection.readTimeout = readTimeoutMillis
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("User-Agent", "MazoMaps-Android-SDK/1")
        if (body != null) {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        val cancellation = currentCoroutineContext().job.invokeOnCompletion { cause ->
            if (cause is CancellationException) connection.disconnect()
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            execute(connection)
        } finally {
            cancellation.dispose()
        }
    }

    private fun execute(connection: HttpURLConnection): JSONObject {
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(payload) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                throw MazoApiException(
                    statusCode = status,
                    code = json.optString("error", "request_failed"),
                    coverage = json.optNullableString("coverage"),
                    startSnapMeters = json.optDoubleOrNull("startSnapMeters"),
                    endSnapMeters = json.optDoubleOrNull("endSnapMeters"),
                    message = json.optString("error", "Mazo Maps request failed with HTTP $status"),
                )
            }
            return json
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        const val DEFAULT_BASE_URL = "https://maps.mazo.workers.dev"

        internal fun apiUrl(baseUrl: String, path: String): String = baseUrl.trimEnd('/') + path

        private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())
    }
}

private fun JSONArray?.toPlaces(): List<MazoPlace> = this?.let { rows ->
    (0 until rows.length()).mapNotNull { rows.optJSONObject(it)?.toPlace() }
} ?: emptyList()

private fun JSONObject.toPlace(coordinates: JSONArray? = optJSONArray("coordinates")): MazoPlace? {
    val id = optString("id").takeIf(String::isNotBlank) ?: return null
    val name = optString("name").takeIf(String::isNotBlank) ?: return null
    val coordinate = if (coordinates != null && coordinates.length() >= 2) {
        val longitude = coordinates.optDouble(0, Double.NaN)
        val latitude = coordinates.optDouble(1, Double.NaN)
        runCatching { MazoCoordinate(longitude, latitude) }.getOrNull()
    } else null
    return MazoPlace(
        id = id,
        name = name,
        address = optNullableString("address") ?: optNullableString("label"),
        category = optNullableString("discoveryCategory") ?: optNullableString("category"),
        coordinate = coordinate,
        score = optInt("score").takeIf { has("score") },
    )
}

private fun JSONObject.toRoute(defaultProfile: MazoRouteProfile): MazoRoute? {
    val line = optJSONObject("geometry")?.optJSONArray("coordinates") ?: return null
    val coordinates = (0 until line.length()).mapNotNull { index ->
        val pair = line.optJSONArray(index) ?: return@mapNotNull null
        if (pair.length() < 2) return@mapNotNull null
        runCatching { MazoCoordinate(pair.getDouble(0), pair.getDouble(1)) }.getOrNull()
    }
    if (coordinates.size < 2) return null
    val routeSteps = optJSONArray("instructions") ?: JSONArray()
    val steps = (0 until routeSteps.length()).mapNotNull { index ->
        val step = routeSteps.optJSONObject(index) ?: return@mapNotNull null
        val location = step.optJSONArray("location")
        MazoRouteStep(
            type = step.optString("type", "continue"),
            modifier = step.optNullableString("modifier"),
            name = step.optNullableString("name"),
            coordinate = if (location != null && location.length() >= 2) runCatching {
                MazoCoordinate(location.getDouble(0), location.getDouble(1))
            }.getOrNull() else null,
            progressMeters = step.optDouble("progressMeters", 0.0),
        )
    }
    val profile = MazoRouteProfile.entries.firstOrNull { it.wireValue == optString("profile") } ?: defaultProfile
    return MazoRoute(
        profile = profile,
        coordinates = coordinates,
        distanceMeters = optDouble("distance"),
        durationSeconds = optDouble("duration"),
        startSnapMeters = optDouble("startSnapMeters"),
        endSnapMeters = optDouble("endSnapMeters"),
        steps = steps,
        durationNote = optNullableString("durationNote"),
    )
}

private fun JSONObject.optDoubleOrNull(key: String): Double? = if (has(key) && !isNull(key)) optDouble(key) else null
private fun JSONObject.optNullableString(key: String): String? = optString(key).takeIf { it.isNotBlank() && it != "null" }
