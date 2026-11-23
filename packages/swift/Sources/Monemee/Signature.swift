import Foundation
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

/// Public Ed25519 key in JWK form (`kty: OKP`, `crv: Ed25519`), as published at
/// `/.well-known/monemee-license-keys.json`.
public struct LicensePublicKey: Sendable, Hashable, Codable {
    /// Key ID referenced by ``SignedLicense/kid``.
    public let kid: String
    /// Raw 32-byte public key, base64url without padding.
    public let x: String
    public let kty: String
    public let crv: String

    public init(kid: String, x: String, kty: String = "OKP", crv: String = "Ed25519") {
        self.kid = kid
        self.x = x
        self.kty = kty
        self.crv = crv
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kid = try c.decode(String.self, forKey: .kid)
        x = try c.decode(String.self, forKey: .x)
        kty = try c.decodeIfPresent(String.self, forKey: .kty) ?? "OKP"
        crv = try c.decodeIfPresent(String.self, forKey: .crv) ?? "Ed25519"
    }

    /// Public signing keys of monemee.com, bundled with the SDK. Unknown key IDs (after a
    /// key rotation) are fetched from `/.well-known/monemee-license-keys.json` and remembered.
    public static let bundled: [LicensePublicKey] = [
        LicensePublicKey(kid: "mm-1", x: "-dEgFSZLvP66Cqh_ksHi4rfOJoR2IKp8k3s9LBtUMgM")
    ]
}

/// The `signed` object of a license response: an Ed25519 signature over the exact
/// `payload` string (canonical JSON with sorted keys).
public struct SignedLicense: Sendable, Hashable, Codable {
    public let payload: String
    /// Signature, base64url without padding.
    public let signature: String
    public let kid: String
    public let alg: String?

    public init(payload: String, signature: String, kid: String, alg: String? = "EdDSA") {
        self.payload = payload
        self.signature = signature
        self.kid = kid
        self.alg = alg
    }
}

/// Contents of a verified ``SignedLicense/payload``.
public struct LicensePayload: Sendable, Equatable, Decodable {
    public var v: Int?
    /// Lowercase hex SHA-256 of the normalized license key.
    public var keySHA256: String?
    public var productId: Int?
    /// Device the response was issued for, `nil` if it is not bound to a device.
    public var deviceId: String?
    public var valid: Bool
    public var reason: LicenseReason?
    public var plan: String?
    /// ISO 8601 timestamp or `nil`.
    public var expiresAt: String?
    public var test: Bool
    /// ISO 8601 timestamp of the signature.
    public var issuedAt: String?

    enum CodingKeys: String, CodingKey {
        case v, valid, reason, plan, test
        case keySHA256 = "key_sha256"
        case productId = "product_id"
        case deviceId = "device_id"
        case expiresAt = "expires_at"
        case issuedAt = "issued_at"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        v = try? c.decodeIfPresent(Int.self, forKey: .v)
        keySHA256 = try? c.decodeIfPresent(String.self, forKey: .keySHA256)
        productId = try? c.decodeIfPresent(Int.self, forKey: .productId)
        deviceId = try? c.decodeIfPresent(String.self, forKey: .deviceId)
        valid = (try? c.decodeIfPresent(Bool.self, forKey: .valid)) ?? false
        reason = try? c.decodeIfPresent(LicenseReason.self, forKey: .reason)
        plan = try? c.decodeIfPresent(String.self, forKey: .plan)
        expiresAt = try? c.decodeIfPresent(String.self, forKey: .expiresAt)
        test = (try? c.decodeIfPresent(Bool.self, forKey: .test)) ?? false
        issuedAt = try? c.decodeIfPresent(String.self, forKey: .issuedAt)
    }
}

/// Ed25519 verification of signed license responses.
public enum LicenseSignature {
    /// Verifies `signed.signature` over the exact UTF-8 bytes of `signed.payload` with the key
    /// whose `kid` matches. Returns the decoded payload, or `nil` for an unknown key ID, a
    /// wrong signature or unreadable data.
    ///
    /// This only checks the signature. ``License`` additionally checks product, key hash,
    /// device and issue time before it trusts a response.
    public static func verify(_ signed: SignedLicense, publicKeys: [LicensePublicKey]) -> LicensePayload? {
        guard let jwk = publicKeys.first(where: { $0.kid == signed.kid }),
              let rawKey = Base64URL.decode(jwk.x), rawKey.count == 32,
              let signature = Base64URL.decode(signed.signature),
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: rawKey) else { return nil }
        let message = Data(signed.payload.utf8)
        guard key.isValidSignature(signature, for: message) else { return nil }
        return try? JSONDecoder().decode(LicensePayload.self, from: message)
    }
}

enum Base64URL {
    static func decode(_ string: String) -> Data? {
        var s = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let remainder = s.count % 4
        if remainder == 1 { return nil }
        if remainder > 0 { s += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: s)
    }

    static func encode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

enum Hashing {
    static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

enum Timestamp {
    /// Parses ISO 8601 with or without fractional seconds, like `Date.parse` in JavaScript.
    static func parse(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: value) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: value)
    }
}
