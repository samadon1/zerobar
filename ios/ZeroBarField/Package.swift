// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "ZeroBarField",
    platforms: [
        .iOS(.v18)
    ],
    products: [
        .library(
            name: "ZeroBarField",
            targets: ["ZeroBarField"]
        )
    ],
    dependencies: [
        // Firebase Apple SDK with Firebase AI Logic (Hybrid On-Device Apple Foundation Models + Cloud Gemini),
        // Firebase App Check (App Attest / Debug Provider), and offline-first Cloud Firestore.
        .package(
            url: "https://github.com/firebase/firebase-ios-sdk.git",
            from: "12.0.0"
        )
    ],
    targets: [
        .target(
            name: "ZeroBarField",
            dependencies: [
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseAI", package: "firebase-ios-sdk"),
                .product(name: "FirebaseAppCheck", package: "firebase-ios-sdk"),
                .product(name: "FirebaseFirestore", package: "firebase-ios-sdk")
            ],
            path: ".",
            exclude: [
                "Package.swift"
            ],
            sources: [
                "ZeroBarFieldApp.swift",
                "Models",
                "Services",
                "Views"
            ]
        )
    ]
)
