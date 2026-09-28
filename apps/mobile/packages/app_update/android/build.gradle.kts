group = "com.izyane.appupdate"
version = "1.0"

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.13.1")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

plugins {
    id("com.android.library")
}

android {
    namespace = "com.izyane.appupdate"
    compileSdk = flutter.compileSdkVersion

    defaultConfig {
        minSdk = 23
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Firebase App Distribution. The API library is safe in any build; the full
// SDK is what installs updates, and Google Play forbids apps that update
// themselves — so a store build leaves it out:
//
//   flutter build appbundle -PstoreBuild=true
//
// Without the full SDK every call fails as "unavailable", and the app says
// updates come through the store.
val appDistribution = "16.0.0-beta20"
dependencies {
    // For the installer's theme (see AndroidManifest.xml); the SDK already
    // brings AppCompat, this lets the plugin's resources name it.
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("com.google.firebase:firebase-appdistribution-api:$appDistribution")
    if (!rootProject.hasProperty("storeBuild")) {
        implementation("com.google.firebase:firebase-appdistribution:$appDistribution")
    }
}
