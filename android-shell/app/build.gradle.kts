plugins {
    id("com.android.application")
}

android {
    namespace = "com.letmefly.galaxyshell"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.letmefly.galaxyshell"
        minSdk = 23
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0-galaxy-shell"
    }

    signingConfigs {
        create("letmeflyTest") {
            storeFile = file("../../android-twa/signing/letmefly-test.jks")
            storePassword = "letmefly-test-only"
            keyAlias = "letmeflytest"
            keyPassword = "letmefly-test-only"
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("letmeflyTest")
        }
    }
}
