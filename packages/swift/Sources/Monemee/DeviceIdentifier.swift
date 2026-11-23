import Foundation
#if os(macOS)
import IOKit
#endif

/// Stable device IDs for license activations.
///
/// By default ``License`` derives the device ID from a machine identifier, so the activation
/// survives a reinstall or a deleted license file: `IOPlatformUUID` on macOS and
/// `/etc/machine-id` on Linux. The identifier is never sent as is. It is hashed together with
/// the product ID, so two products see unrelated IDs. Where no machine identifier exists
/// (iOS, sandboxes without access), a random ID is created once and stored.
public enum DeviceIdentifier {
    /// The raw machine identifier of this computer, or `nil` if there is none.
    public static func machineIdentifier() -> String? {
        #if os(macOS)
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOPlatformExpertDevice"))
        guard service != 0 else { return nil }
        defer { IOObjectRelease(service) }
        let property = IORegistryEntryCreateCFProperty(service, "IOPlatformUUID" as CFString, kCFAllocatorDefault, 0)
        return (property?.takeRetainedValue() as? String).flatMap { $0.isEmpty ? nil : $0 }
        #elseif os(Linux)
        for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"] {
            if let raw = try? String(contentsOfFile: path, encoding: .utf8) {
                let id = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if !id.isEmpty { return id }
            }
        }
        return nil
        #else
        return nil
        #endif
    }

    /// Device ID sent to Monemee for a machine identifier: `d_` followed by the first
    /// 32 hex characters of `SHA-256("monemee-device:<productId>:<machineIdentifier>")`.
    public static func hashed(_ machineIdentifier: String, productId: Int) -> String {
        "d_" + Hashing.sha256Hex("monemee-device:\(productId):\(machineIdentifier)").prefix(32)
    }

    /// Random device ID in the same format as `monemee-client`: `d_` + 32 hex characters.
    public static func random() -> String {
        "d_" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }
}
