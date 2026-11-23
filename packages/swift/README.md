# Monemee for Swift

License key validation for native apps on macOS, iOS and Linux. Activate a key once, check it on every start, and keep working offline thanks to responses signed with Ed25519. Async/await API, `Sendable` types, no secrets in the app.

[Monemee SDK](https://github.com/monemee/monemee-sdk) · [Documentation](https://dev.monemee.com) · [macOS guide](https://dev.monemee.com/guides/swift-macos-license-key/)

## Install

Swift Package Manager, Swift 5.9 or newer:

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/monemee/monemee-sdk.git", from: "0.2.0")
],
targets: [
    .target(name: "MyApp", dependencies: [.product(name: "Monemee", package: "monemee-sdk")])
]
```

In Xcode: *File > Add Package Dependencies*, enter `https://github.com/monemee/monemee-sdk.git` and add the `Monemee` library.

Platforms: macOS 12, iOS 15, Linux. Apple platforms use CryptoKit; Linux uses [swift-crypto](https://github.com/apple/swift-crypto).

## Usage

```swift
import Monemee

let license = try License(productId: 123)

// First start: the key from the purchase email
let result = try await license.activate(keyFromUser)
if !result.valid { showError(result.reason) }      // for example .activationLimit

// Every start
let status = try await license.check()
if status.valid { startPro(plan: status.plan) }
```

`check()` does not throw when Monemee is unreachable. It returns the last verified response (`offline == true`) or `reason == .offline`.

## How `check()` works

1. It asks Monemee whether the key is valid on this device.
2. It verifies the Ed25519 signature of the answer and stores it.
3. Without a connection, the last valid answer counts for `graceDays` more days (default 7).

A stored answer is only accepted if the signature matches a Monemee public key and the key hash, product, device and issue time match. When a buyer is refunded, the next online check returns `.revoked` and the stored key is removed.

## SwiftUI paywall

```swift
import Monemee
import SwiftUI

@MainActor
final class LicenseModel: ObservableObject {
    @Published var result: LicenseResult?
    let license = try! License(productId: 123)

    func check() async { result = try? await license.check() }
    func activate(_ key: String) async { result = try? await license.activate(key) }
}

struct LicenseGate<Pro: View>: View {
    @StateObject private var model = LicenseModel()
    @State private var key = ""
    @ViewBuilder var pro: () -> Pro

    var body: some View {
        Group {
            if model.result?.valid == true {
                pro()
            } else {
                VStack(spacing: 12) {
                    TextField("MM-XXXX-XXXX-XXXX-XXXX", text: $key)
                    Button("Activate") { Task { await model.activate(key) } }
                    Button("Buy a license") { try? Monemee.openBuyPage(productId: 123) }
                }
                .padding()
            }
        }
        .task { await model.check() }
    }
}
```

A complete macOS app is in [examples/swift-macos](../../examples/swift-macos). On iOS, open `Monemee.buyURL(productId:)` with SwiftUI's `openURL` or a `Link`.

## Options

| Parameter | Default | |
|---|---|---|
| `productId` | – | Your Monemee product ID |
| `graceDays` | `7` | How long the app keeps working offline |
| `appName` | `monemee-<productId>` | Folder name for the default file storage |
| `storage` | `FileLicenseStorage` | Custom `LicenseStorage`, for example the Keychain |
| `deviceId` | derived from the machine | Fixed device ID (max. 128 characters) |
| `deviceName` | – | Shown in the device list of your dashboard |
| `baseURL` | `https://monemee.com` | Monemee server |
| `publicKeys` | – | Additional trusted keys; the bundled Monemee keys are always included |
| `transport` | `URLSessionTransport()` | HTTP client, injectable for tests |
| `machineIdentifier`, `now` | system | Injectable for tests |

### Where the license is stored

`FileLicenseStorage` writes `license.json` (mode `0600`) to:

- macOS and iOS: `~/Library/Application Support/monemee-<id>/`, inside the app container for sandboxed apps
- Linux: `$XDG_CONFIG_HOME/monemee-<id>/` or `~/.config/monemee-<id>/`
- Windows: `%APPDATA%\monemee-<id>\`

The file has the same layout as the one written by `monemee-client`. Implement `LicenseStorage` to keep it in the Keychain instead.

### Device ID

By default the device ID is derived from the machine: `IOPlatformUUID` on macOS, `/etc/machine-id` on Linux. It is never sent as is; the SDK sends `d_` plus a SHA-256 hash of the identifier and the product ID, so the activation survives a reinstall and two products see unrelated IDs. Where no machine identifier exists (iOS), a random ID is created once and stored.

## Methods

| Method | Returns | |
|---|---|---|
| `activate(_:deviceName:)` | `LicenseResult` | Activates a key on this device. Throws `.invalidKey` for a malformed key without sending a request |
| `check()` | `LicenseResult` | Validates online, falls back to the stored signed response |
| `deactivate()` | `Bool` | Frees this device and forgets the key |
| `storedKey()` | `String?` | The activated key |
| `deviceId()` | `String` | The device ID sent to Monemee |
| `buyURL(ref:affiliate:)` | `URL` | Checkout link of the product |

`LicenseResult` has `valid`, `reason`, `plan`, `expiresAt` (`Date?`), `test`, `offline` and `activations`.

### Reasons

| `LicenseReason` | Meaning |
|---|---|
| `.notActivated` | No key stored on this device yet |
| `.notFound` | The key does not exist for this product |
| `.revoked` | Revoked, for example after a refund |
| `.expired` | The license duration has ended |
| `.activationLimit` | The device limit is reached; free a device with `deactivate()` |
| `.deviceNotActivated` | The key is valid but not activated on this device |
| `.offline` | No connection and no valid stored response |
| `.invalidSignature` | The online answer carries a signature that does not verify |

### Errors

`LicenseError` has a `code` (`.config`, `.invalidKey`, `.invalidRef`, `.rateLimited`, `.server`, `.network`), a `message` and the HTTP `status`. `activate` and `deactivate` need a connection and throw; `check()` falls back to the stored response instead.

## Selling the app

`Monemee.openBuyPage(productId:)` (macOS) opens the hosted checkout at `https://monemee.com/buy/<id>`; `Monemee.buyURL(productId:ref:affiliate:)` returns the link for other platforms. After paying, the buyer receives the key by email and enters it in your app.

## Testing

Create a test key in the dashboard under *License keys > Test key*. Test keys behave like real ones and report `test == true`.

```bash
swift test
```

## License

[MIT](../../LICENSE)
