plugins {
    id("com.android.application")
}

android {
    namespace = "com.letmefly.app"
    compileSdk = 36

    defaultConfig {
        // Keep the permanent Play identity (com.letmefly.app) unused during
        // direct Galaxy testing. A fresh package avoids stale/partial package
        // conflicts from earlier sideload attempts on the device.
        applicationId = "com.letmefly.galaxytest"
        minSdk = 23
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.1-galaxy-test"
    }

    signingConfigs {
        create("letmeflyTest") {
            storeFile = file("../signing/letmefly-test.jks")
            storePassword = "letmefly-test-only"
            keyAlias = "letmeflytest"
            keyPassword = "letmefly-test-only"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("letmeflyTest")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("letmeflyTest")
        }
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.3")
}
