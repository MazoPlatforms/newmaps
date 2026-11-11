plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mazoplatforms.mazomaps"
    compileSdk = 35

    defaultConfig {
        minSdk = 23
        consumerProguardFiles("consumer-rules.pro")
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    api("org.maplibre.gl:android-sdk:11.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation("junit:junit:4.13.2")
}
