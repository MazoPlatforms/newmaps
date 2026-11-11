package com.mazoplatforms.mazomaps

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class MazoMapOptionsTest {
    @Test fun defaultOptionsPointAtSelfHostedMapServices() {
        val options = MazoMapOptions()
        assertEquals(6.7, options.zoom, 0.0)
        assertEquals("https://maps.mazo.workers.dev/api/v1/style.json", options.styleUrl())
        assertEquals(
            "https://maps.mazo.workers.dev/api/v1/style/dark.json",
            MazoMapOptions(theme = MazoTheme.DARK).styleUrl(),
        )
    }

    @Test fun coordinatesRejectInvalidValues() {
        assertThrows(IllegalArgumentException::class.java) { MazoCoordinate(181.0, 7.0) }
        assertThrows(IllegalArgumentException::class.java) { MazoCoordinate(81.0, 91.0) }
    }

    @Test fun hostedHttpIsRejected() {
        assertThrows(IllegalArgumentException::class.java) { MazoMapOptions(baseUrl = "http://public.example") }
    }
}
