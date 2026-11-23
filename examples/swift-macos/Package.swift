// swift-tools-version: 5.9
import PackageDescription

// Minimal SwiftUI app for macOS with a Monemee license key paywall.
// Run on a Mac: swift run   (or open Package.swift in Xcode)
let package = Package(
    name: "LicenseDemo",
    platforms: [.macOS(.v12)],
    dependencies: [
        // In your app: .package(url: "https://github.com/monemee/monemee-sdk.git", from: "0.2.0")
        .package(name: "Monemee", path: "../..")
    ],
    targets: [
        .executableTarget(name: "LicenseDemo", dependencies: [.product(name: "Monemee", package: "Monemee")])
    ]
)
