// ZeroBar Android Field Node — Root Gradle Configuration (#BuildHybridAI 2026)
// Coordinates declared across :app for Firebase AI Logic Hybrid Inference (AICore Gemini Nano + Cloud Gemini),
// Firebase App Check (Play Integrity + Debug), Offline Cloud Firestore, and Jetpack Compose Material 3:
//   - platform("com.google.firebase:firebase-bom:34.4.0")
//   - "com.google.firebase:firebase-ai"
//   - "com.google.firebase:firebase-ai-ondevice:16.0.0-beta07"
//   - "com.google.firebase:firebase-appcheck-playintegrity"
//   - "com.google.firebase:firebase-appcheck-debug"
//   - "com.google.firebase:firebase-firestore"
//   - "androidx.compose.material3:material3"

plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
}

extra.apply {
    set("firebaseBom", "com.google.firebase:firebase-bom:34.4.0")
    set("firebaseAi", "com.google.firebase:firebase-ai")
    set("firebaseAiOnDevice", "com.google.firebase:firebase-ai-ondevice:16.0.0-beta07")
    set("firebaseAppCheckPlayIntegrity", "com.google.firebase:firebase-appcheck-playintegrity")
    set("firebaseAppCheckDebug", "com.google.firebase:firebase-appcheck-debug")
    set("firebaseFirestore", "com.google.firebase:firebase-firestore")
    set("composeMaterial3", "androidx.compose.material3:material3")
}
