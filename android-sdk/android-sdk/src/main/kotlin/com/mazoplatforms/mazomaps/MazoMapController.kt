package com.mazoplatforms.mazomaps

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.location.LocationComponentActivationOptions
import org.maplibre.android.location.modes.CameraMode
import org.maplibre.android.location.modes.RenderMode
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.iconAllowOverlap
import org.maplibre.android.style.layers.PropertyFactory.iconAnchor
import org.maplibre.android.style.layers.PropertyFactory.iconIgnorePlacement
import org.maplibre.android.style.layers.PropertyFactory.iconImage
import org.maplibre.android.style.layers.PropertyFactory.iconSize
import org.maplibre.android.style.layers.PropertyFactory.lineCap
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineJoin
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.layers.PropertyFactory.textAllowOverlap
import org.maplibre.android.style.layers.PropertyFactory.textField
import org.maplibre.android.style.layers.PropertyFactory.textFont
import org.maplibre.android.style.layers.PropertyFactory.textHaloColor
import org.maplibre.android.style.layers.PropertyFactory.textHaloWidth
import org.maplibre.android.style.layers.PropertyFactory.textOptional
import org.maplibre.android.style.layers.PropertyFactory.textRadialOffset
import org.maplibre.android.style.layers.PropertyFactory.textSize
import org.maplibre.android.style.layers.PropertyFactory.textVariableAnchor
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

/** Installs native, tile-backed place rendering and draws route alternatives. */
class MazoMapController private constructor(
    private val map: MapLibreMap,
    private val pinLayer: SymbolLayer,
) {
    var onPlaceTap: ((MazoPlaceReference) -> Unit)? = null

    private val cameraListener = MapLibreMap.OnCameraIdleListener {
        val showAll = map.cameraPosition.zoom >= 18.0
        pinLayer.setProperties(iconAllowOverlap(showAll), iconIgnorePlacement(showAll))
    }
    private val mapClickListener = MapLibreMap.OnMapClickListener { coordinate ->
        val point = map.projection.toScreenLocation(coordinate)
        val feature = map.queryRenderedFeatures(point, PIN_LAYER).firstOrNull()
        if (feature == null) false else {
            val id = feature.getStringProperty("id")
            val name = feature.getStringProperty("name")
            if (id.isNotBlank()) onPlaceTap?.invoke(MazoPlaceReference(id, name, coordinate))
            true
        }
    }

    init {
        map.addOnCameraIdleListener(cameraListener)
        map.addOnMapClickListener(mapClickListener)
    }

    /** Call before replacing this style/controller to avoid retaining listeners. */
    fun close() {
        map.removeOnCameraIdleListener(cameraListener)
        map.removeOnMapClickListener(mapClickListener)
        onPlaceTap = null
    }

    /** Call only after the host app has obtained Android runtime location permission. */
    fun enableLocation(context: Context, style: Style, permissionGranted: Boolean) {
        require(permissionGranted) { "Request ACCESS_FINE_LOCATION or ACCESS_COARSE_LOCATION before enabling GPS." }
        val location = map.locationComponent
        location.activateLocationComponent(LocationComponentActivationOptions.builder(context.applicationContext, style).build())
        location.isLocationComponentEnabled = true
        location.cameraMode = CameraMode.TRACKING
        location.renderMode = RenderMode.COMPASS
    }

    fun disableLocation() {
        map.locationComponent.isLocationComponentEnabled = false
    }

    fun drawRoute(route: MazoRoute, color: Int = 0xff2563eb.toInt()) {
        val style = map.style ?: return
        if (style.getLayer(ROUTE_LAYER) != null) style.removeLayer(ROUTE_LAYER)
        if (style.getSource(ROUTE_SOURCE) != null) style.removeSource(ROUTE_SOURCE)
        val points = route.coordinates.map { Point.fromLngLat(it.longitude, it.latitude) }
        style.addSource(GeoJsonSource(ROUTE_SOURCE, Feature.fromGeometry(LineString.fromLngLats(points))))
        style.addLayer(LineLayer(ROUTE_LAYER, ROUTE_SOURCE).withProperties(
            lineColor(color), lineWidth(5.0f), lineCap("round"), lineJoin("round"),
        ))
    }

    fun clearRoute() {
        val style = map.style ?: return
        if (style.getLayer(ROUTE_LAYER) != null) style.removeLayer(ROUTE_LAYER)
        if (style.getSource(ROUTE_SOURCE) != null) style.removeSource(ROUTE_SOURCE)
    }

    companion object {
        private const val SOURCE = "mazo"
        private const val DOT_LAYER = "mazo-android-place-dots"
        private const val PIN_LAYER = "mazo-android-place-pins"
        private const val PIN_IMAGE = "mazo-android-place-pin"
        private const val ROUTE_SOURCE = "mazo-android-route"
        private const val ROUTE_LAYER = "mazo-android-route-line"

        fun install(map: MapLibreMap, style: Style): MazoMapController {
            require(style.getSource(SOURCE) != null) {
                "Load a Mazo Maps /api/v1/style.json style before installing place layers."
            }
            style.removeLayerIfPresent("places-dot")
            style.removeLayerIfPresent("places-label")
            style.addImage(PIN_IMAGE, pinBitmap())

            val dots = CircleLayer(DOT_LAYER, SOURCE).withSourceLayer("places")
                .withProperties(circleColor("#2563eb"), circleRadius(3.5f), circleStrokeColor("#ffffff"), circleStrokeWidth(1.25f))
                .apply { setMinZoom(8.8f); setMaxZoom(13.0f) }
            style.addLayer(dots)

            val pins = SymbolLayer(PIN_LAYER, SOURCE).withSourceLayer("places")
                .withProperties(
                    iconImage(PIN_IMAGE), iconAnchor("bottom"), iconSize(0.72f),
                    iconAllowOverlap(false), iconIgnorePlacement(false),
                    textField("{name}"), textFont(arrayOf("Mazo Maps Sans Regular")),
                    textSize(11.0f), textVariableAnchor(arrayOf("top", "bottom", "left", "right")),
                    textRadialOffset(0.85f),
                    textOptional(true), textAllowOverlap(false),
                    textHaloColor("#ffffff"), textHaloWidth(1.4f),
                )
                .apply { setMinZoom(13.0f); setMaxZoom(20.1f) }
            style.addLayer(pins)
            return MazoMapController(map, pins)
        }

        private fun Style.removeLayerIfPresent(id: String) {
            if (getLayer(id) != null) removeLayer(id)
        }

        private fun pinBitmap(): Bitmap {
            val width = 48
            val height = 64
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val path = Path().apply {
                moveTo(24f, 62f)
                cubicTo(19f, 52f, 5f, 38f, 5f, 24f)
                arcTo(19f, 5f, 43f, 43f, 180f, -180f, false)
                cubicTo(43f, 38f, 29f, 52f, 24f, 62f)
                close()
            }
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xff2563eb.toInt(); style = Paint.Style.FILL }
            canvas.drawPath(path, paint)
            paint.color = 0xffffffff.toInt(); paint.style = Paint.Style.STROKE; paint.strokeWidth = 3f
            canvas.drawPath(path, paint)
            paint.style = Paint.Style.FILL
            canvas.drawCircle(24f, 24f, 7f, paint)
            return bitmap
        }
    }
}

data class MazoPlaceReference(val id: String, val name: String, val tappedAt: LatLng)
