package com.mazoplatforms.mazomaps

enum class MazoTheme(val stylePath: String) {
    LIGHT("/api/v1/style.json"),
    DARK("/api/v1/style/dark.json"),
}

enum class MazoRouteProfile(val wireValue: String) {
    DRIVING("driving"),
    WALKING("walking"),
    CYCLING("cycling"),
}

data class MazoCoordinate(val longitude: Double, val latitude: Double) {
    init {
        require(longitude.isFinite() && longitude in -180.0..180.0) { "Longitude must be within -180..180." }
        require(latitude.isFinite() && latitude in -90.0..90.0) { "Latitude must be within -90..90." }
    }
}

data class MazoMapOptions(
    val baseUrl: String = MazoMapsClient.DEFAULT_BASE_URL,
    val center: MazoCoordinate = MazoCoordinate(80.8, 7.85),
    val zoom: Double = 6.7,
    val theme: MazoTheme = MazoTheme.LIGHT,
) {
    init {
        require(zoom.isFinite() && zoom in 0.0..20.0) { "Zoom must be within 0..20." }
        require(baseUrl.startsWith("https://") || baseUrl.startsWith("http://localhost")) {
            "Use HTTPS for hosted map services. HTTP is accepted for local development only."
        }
    }

    fun styleUrl(): String = MazoMapsClient.apiUrl(baseUrl, theme.stylePath)
}

data class MazoPlace(
    val id: String,
    val name: String,
    val address: String?,
    val category: String?,
    val coordinate: MazoCoordinate?,
    val score: Int?,
)

data class MazoRouteStep(
    val type: String,
    val modifier: String?,
    val name: String?,
    val coordinate: MazoCoordinate?,
    val progressMeters: Double,
)

data class MazoRoute(
    val profile: MazoRouteProfile,
    val coordinates: List<MazoCoordinate>,
    val distanceMeters: Double,
    val durationSeconds: Double,
    val startSnapMeters: Double,
    val endSnapMeters: Double,
    val steps: List<MazoRouteStep>,
    val durationNote: String?,
)

data class MazoRouteResult(
    val revision: String?,
    val coverage: String?,
    val routes: List<MazoRoute>,
)

class MazoApiException(
    val statusCode: Int,
    val code: String,
    val coverage: String?,
    val startSnapMeters: Double?,
    val endSnapMeters: Double?,
    message: String,
) : Exception(message)
