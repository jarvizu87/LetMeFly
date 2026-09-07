plugins {
    id("com.android.application")
}

android {
    namespace = "com.letmefly.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.letmefly.app"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-test"
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
