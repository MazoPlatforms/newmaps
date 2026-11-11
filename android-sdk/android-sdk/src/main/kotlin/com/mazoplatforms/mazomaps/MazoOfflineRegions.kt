package com.mazoplatforms.mazomaps

import android.content.Context
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.offline.OfflineManager
import org.maplibre.android.offline.OfflineRegion
import org.maplibre.android.offline.OfflineRegionError
import org.maplibre.android.offline.OfflineRegionStatus
import org.maplibre.android.offline.OfflineTilePyramidRegionDefinition
import org.maplibre.android.offline.OfflineManager.CreateOfflineRegionCallback

data class MazoOfflineProgress(
    val completedResources: Long,
    val requiredResources: Long,
    val totalBytes: Long,
    val isComplete: Boolean,
    val requiredCountIsPrecise: Boolean,
)

/** Downloads self-hosted style, fonts, and map tiles for a bounded region. */
class MazoOfflineRegions(context: Context, private val baseUrl: String = MazoMapsClient.DEFAULT_BASE_URL) {
    private val manager = OfflineManager.getInstance(context.applicationContext)

    fun download(
        bounds: LatLngBounds,
        theme: MazoTheme = MazoTheme.LIGHT,
        minZoom: Double = 8.0,
        maxZoom: Double = 16.0,
        pixelRatio: Float = 1.0f,
        onProgress: (MazoOfflineProgress) -> Unit,
        onFailure: (String) -> Unit,
        onReady: (MazoOfflineRegion) -> Unit,
    ) {
        require(minZoom >= 0.0 && maxZoom >= minZoom && maxZoom <= 20.0)
        require(pixelRatio in 0.5f..3.0f)
        val definition = OfflineTilePyramidRegionDefinition(
            MazoMapOptions(baseUrl = baseUrl, theme = theme).styleUrl(),
            bounds,
            minZoom,
            maxZoom,
            pixelRatio,
        )
        manager.createOfflineRegion(definition, "mazo-offline-v1".toByteArray(), object : CreateOfflineRegionCallback {
            override fun onCreate(offlineRegion: OfflineRegion) {
                val handle = MazoOfflineRegion(offlineRegion)
                offlineRegion.setObserver(object : OfflineRegion.OfflineRegionObserver {
                    override fun onStatusChanged(status: OfflineRegionStatus) {
                        val progress = MazoOfflineProgress(
                            completedResources = status.completedResourceCount,
                            requiredResources = status.requiredResourceCount,
                            totalBytes = status.completedResourceSize,
                            isComplete = status.isComplete && status.isRequiredResourceCountPrecise,
                            requiredCountIsPrecise = status.isRequiredResourceCountPrecise,
                        )
                        onProgress(progress)
                        if (progress.isComplete) {
                            offlineRegion.setDownloadState(OfflineRegion.STATE_INACTIVE)
                            offlineRegion.setObserver(null)
                        }
                    }

                    override fun onError(error: OfflineRegionError) = onFailure(error.message ?: "Offline map download failed.")
                    override fun mapboxTileCountLimitExceeded(limit: Long) = onFailure("MapLibre offline tile limit reached ($limit).")
                })
                offlineRegion.setDownloadState(OfflineRegion.STATE_ACTIVE)
                onReady(handle)
            }
            override fun onError(error: String) = onFailure(error)
        })
    }
}

class MazoOfflineRegion internal constructor(private val region: OfflineRegion) {
    val id: Long get() = region.id
    fun pause() = region.setDownloadState(OfflineRegion.STATE_INACTIVE)
    fun resume() = region.setDownloadState(OfflineRegion.STATE_ACTIVE)
    fun delete(onDeleted: () -> Unit = {}, onFailure: (String) -> Unit = {}) {
        region.delete(object : OfflineRegion.OfflineRegionDeleteCallback {
            override fun onDelete() = onDeleted()
            override fun onError(message: String) = onFailure(message)
        })
    }
}
