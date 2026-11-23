// swift-tools-version: 5.9
import PackageDescription

// Monemee license keys for native Swift apps (macOS, iOS, Linux).
// The repository root has a second manifest with the same library target, so the
// package can be added by the repository URL. Keep both in sync.
let package = Package(
    name: "Monemee",
    platforms: [.macOS(.v12), .iOS(.v15)],
    products: [
        .library(name: "Monemee", targets: ["Monemee"])
    ],
    dependencies: [
        // Ed25519 and SHA-256 on platforms without CryptoKit (Linux, Windows, Android).
        .package(url: "https://github.com/apple/swift-crypto.git", "3.0.0"..<"5.0.0")
    ],
    targets: [
        .target(
            name: "Monemee",
            dependencies: [
                .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux, .windows, .android]))
            ],
            swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]
        ),
        .testTarget(
            name: "MonemeeTests",
            dependencies: [
                "Monemee",
                .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux, .windows, .android]))
            ],
            swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]
        )
    ]
)
