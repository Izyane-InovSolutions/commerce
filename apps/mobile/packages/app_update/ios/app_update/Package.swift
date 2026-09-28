// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "app_update",
  platforms: [
    .iOS("15.0")
  ],
  products: [
    .library(name: "app-update", targets: ["app_update"])
  ],
  dependencies: [
    // Any Firebase 12: firebase_core pins the exact version, and Swift
    // Package Manager resolves both to that one copy.
    .package(url: "https://github.com/firebase/firebase-ios-sdk", "12.0.0"..<"13.0.0"),
    .package(name: "FlutterFramework", path: "../FlutterFramework"),
  ],
  targets: [
    .target(
      name: "app_update",
      dependencies: [
        .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
        // Beta testing only: never in an App Store build (see DISTRIBUTION.md).
        .product(name: "FirebaseAppDistribution-Beta", package: "firebase-ios-sdk"),
        .product(name: "FlutterFramework", package: "FlutterFramework"),
      ]
    )
  ]
)
