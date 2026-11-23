---
title: License key validation for a Swift macOS app
description: Add license keys to a native macOS app in Swift and SwiftUI. Activate once, check on every start and keep working offline with Ed25519-signed responses.
permalink: /guides/swift-macos-license-key/
updated: 2026-11-23
last_modified_at: 2026-11-23
faq:
  - q: Which platforms does the Swift package support?
    a: macOS 12 and iOS 15 or newer with CryptoKit, and Linux with swift-crypto. It needs Swift 5.9 or newer.
  - q: Does the Swift package work in a sandboxed Mac App Store app?
    a: The license file goes to Application Support inside the app container, and requests to monemee.com need the outgoing network connection entitlement (com.apple.security.network.client). If the machine identifier cannot be read, the SDK falls back to a random device ID stored with the license.
  - q: Where does the Swift package store the license?
    a: In license.json under ~/Library/Application Support/monemee-<product_id>/ on macOS. Pass appName for another folder name, or your own LicenseStorage, for example one backed by the Keychain.
---

# License key validation for a Swift macOS app

<p class="lead">To validate license keys in a native Mac app, add the <code>Monemee</code> Swift package, create <code>License(productId:)</code>, call <code>activate(_:)</code> once and <code>check()</code> on every start. Each response is signed with Ed25519 and stored locally, so the app keeps working offline for <code>graceDays</code>, seven by default.</p>

## Prerequisites

- Xcode 15 or Swift 5.9 or newer, macOS 12 or newer as deployment target.
- A Monemee product with license keys enabled, and its product ID.
- A test key from the dashboard under *License keys > Test key*.

## Steps

### 1. Add the package

In Xcode: *File > Add Package Dependencies*, enter `https://github.com/monemee/monemee-sdk.git` and add the `Monemee` library to your app target. With a `Package.swift`:

```swift
.package(url: "https://github.com/monemee/monemee-sdk.git", from: "0.2.0")
// target dependency:
.product(name: "Monemee", package: "monemee-sdk")
```

Sandboxed apps need the *Outgoing Connections (Client)* capability.

### 2. Create a license model

`License` is an actor, so it can be called from any task. A small `ObservableObject` connects it to SwiftUI:

```swift
import Monemee
import SwiftUI

@MainActor
final class LicenseModel: ObservableObject {
    @Published private(set) var result: LicenseResult?
    @Published var message: String?
    private let license = try! License(productId: 123, deviceName: Host.current().localizedName)

    var unlocked: Bool { result?.valid == true }

    func check() async {
        result = try? await license.check()        // never throws for connection problems
    }

    func activate(_ key: String) async {
        do {
            let r = try await license.activate(key)
            result = r
            message = r.valid ? nil : "Not activated: \(r.reason?.rawValue ?? "unknown")"
        } catch {
            message = error.localizedDescription     // malformed key or no connection
        }
    }

    func deactivate() async {
        _ = try? await license.deactivate()
        result = nil
    }
}
```

### 3. Show a paywall until the key is active

```swift
struct ContentView: View {
    @StateObject private var model = LicenseModel()
    @State private var key = ""

    var body: some View {
        Group {
            if model.unlocked {
                ProView()
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("MM-XXXX-XXXX-XXXX-XXXX", text: $key)
                    if let message = model.message { Text(message).foregroundStyle(.red) }
                    HStack {
                        Button("Activate") { Task { await model.activate(key) } }
                        Button("Buy a license") { try? Monemee.openBuyPage(productId: 123) }
                    }
                }
                .padding()
            }
        }
        .task { await model.check() }
    }
}
```

`Monemee.openBuyPage(productId:)` opens the hosted checkout at `https://monemee.com/buy/123` in the default browser. After paying, the buyer receives the key by email.

### 4. Let buyers move to a new Mac

Offer a *Deactivate this Mac* button that calls `deactivate()`. It frees the device slot on Monemee and removes the stored key, so the buyer can activate the key on another computer.

## How it works

`activate(_:)` normalizes the key, sends it with the product ID and a device ID to Monemee and, if the key is valid and the device limit allows it, stores the key and the signed response. The device ID is a SHA-256 hash of the Mac's `IOPlatformUUID` and the product ID, so it survives a reinstall and never exposes the hardware identifier.

`check()` validates online and stores every new signed response. Without a connection it accepts the stored response only if the signature, key hash, product, device and issue time (within `graceDays`) match, and the license has not expired. Then the result has `offline == true`. A refund makes the next online check return `.revoked` and removes the stored key.

The app contains no secrets: the license endpoints are public and every answer is verified against the Monemee public key bundled with the package.

A complete SwiftUI app is in [examples/swift-macos](https://github.com/monemee/monemee-sdk/tree/main/examples/swift-macos).

## FAQ
{% for item in page.faq %}
### {{ item.q }}

{{ item.a }}
{% endfor %}

## Next steps

- [License keys reference]({{ '/license-keys/' | relative_url }}): reasons a key is not valid, offline verification
- [Swift package on GitHub](https://github.com/monemee/monemee-sdk/tree/main/packages/swift): all options and methods
- [Ship new versions from GitHub Releases]({{ '/github-action/' | relative_url }})
- [All guides]({{ '/guides/' | relative_url }})
