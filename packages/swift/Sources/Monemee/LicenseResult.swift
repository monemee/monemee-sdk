import Foundation

/// Why a license is not valid. The raw values are the `reason` strings of the Monemee API.
/// Unknown reasons from newer servers are kept as their raw value.
public struct LicenseReason: RawRepresentable, Hashable, Sendable, Codable, CustomStringConvertible, ExpressibleByStringLiteral {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public init(stringLiteral value: String) { self.rawValue = value }
    public init(from decoder: Decoder) throws { rawValue = try decoder.singleValueContainer().decode(String.self) }
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
    public var description: String { rawValue }

    /// No key is stored on this device yet. Call `activate(_:)` first.
    public static let notActivated: LicenseReason = "not_activated"
    /// The key does not exist for this product.
    public static let notFound: LicenseReason = "not_found"
    /// The key belongs to another product.
    public static let productMismatch: LicenseReason = "product_mismatch"
    /// Revoked, for example after a refund.
    public static let revoked: LicenseReason = "revoked"
    /// The license duration has ended.
    public static let expired: LicenseReason = "expired"
    /// The key is valid but not activated on this device.
    public static let deviceNotActivated: LicenseReason = "device_not_activated"
    /// The device limit is reached. The buyer can free a device with `deactivate()`.
    public static let activationLimit: LicenseReason = "activation_limit"
    /// No connection and no valid stored response.
    public static let offline: LicenseReason = "offline"
    /// The online answer carries a signature that does not verify.
    public static let invalidSignature: LicenseReason = "invalid_signature"
}

/// How many devices use a key.
public struct LicenseActivations: Sendable, Equatable, Codable {
    public let used: Int
    /// `nil` means unlimited.
    public let max: Int?

    public init(used: Int, max: Int?) {
        self.used = used
        self.max = max
    }
}

/// Result of ``License/activate(_:deviceName:)`` and ``License/check()``.
public struct LicenseResult: Sendable, Equatable {
    public let valid: Bool
    /// `nil` when `valid` is `true`.
    public let reason: LicenseReason?
    /// Plan name configured on the product, for example `"Pro"`.
    public let plan: String?
    /// End of the license, `nil` for licenses without an end date.
    public let expiresAt: Date?
    /// `true` for test keys issued in test mode.
    public let test: Bool
    /// `true` when the result comes from the stored signed response because Monemee was unreachable.
    public let offline: Bool
    /// Device usage, when the server reports it.
    public let activations: LicenseActivations?

    public init(valid: Bool, reason: LicenseReason? = nil, plan: String? = nil, expiresAt: Date? = nil,
                test: Bool = false, offline: Bool = false, activations: LicenseActivations? = nil) {
        self.valid = valid
        self.reason = valid ? nil : reason
        self.plan = plan
        self.expiresAt = expiresAt
        self.test = test
        self.offline = offline
        self.activations = activations
    }
}
