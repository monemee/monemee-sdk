# Swift macOS example

A minimal SwiftUI app for macOS that asks for a license key, activates it with the [Monemee Swift package](../../packages/swift) and unlocks a Pro view. It checks the license on every start and keeps working offline for seven days.

1. Set `productId` in `Sources/LicenseDemo/LicenseDemoApp.swift` to your product ID.
2. Create a test key in the Monemee dashboard under *License keys > Test key*.
3. On a Mac, run `swift run` in this folder, or open `Package.swift` in Xcode.

The "Buy a license" button opens the hosted checkout. After paying, the buyer receives the key by email.
