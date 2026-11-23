// swift-tools-version: 5.9
import PackageDescription

// Swift Package Manager entry point at the repository root, so apps can add the package by
// the repository URL. The sources, tests and docs live in packages/swift; keep this library
// target in sync with packages/swift/Package.swift.
let package = Package(
    name: "Monemee",
    platforms: [.macOS(.v12), .iOS(.v15)],
    products: [
        .library(name: "Monemee", targets: ["Monemee"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-crypto.git", "3.0.0"..<"5.0.0")
    ],
    targets: [
        .target(
            name: "Monemee",
            dependencies: [
                .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux, .windows, .android]))
            ],
            path: "packages/swift/Sources/Monemee",
            swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]
        )
    ]
)
