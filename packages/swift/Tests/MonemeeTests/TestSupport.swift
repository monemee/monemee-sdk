import Foundation
import XCTest
@testable import Monemee
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

let testKey = "MM-A7K2-9FQ3-XT8M-2B4C"
let testProductId = 42

/// Shared vectors of the JavaScript, Python and Swift test suites.
struct Vectors: Decodable {
    struct Case: Decodable {
        let name: String
        let expect: String
        let signed: SignedLicense
    }

    let publicKey: LicensePublicKey
    let licenseKey: String
    let productId: Int
    let deviceId: String
    let issuedAt: String
    let cases: [Case]

    enum CodingKeys: String, CodingKey {
        case cases
        case publicKey = "public_key"
        case licenseKey = "license_key"
        case productId = "product_id"
        case deviceId = "device_id"
        case issuedAt = "issued_at"
    }

    static func load() throws -> Vectors {
        // packages/swift/Tests/MonemeeTests/TestSupport.swift → repository root
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let url = root.appendingPathComponent("test-vectors/license-signatures.json")
        return try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
    }
}

/// Thread-safe mutable box for tests.
final class Locked<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: Value
    init(_ value: Value) { _value = value }
    var value: Value {
        get { lock.lock(); defer { lock.unlock() }; return _value }
        set { lock.lock(); defer { lock.unlock() }; _value = newValue }
    }
    func mutate(_ body: (inout Value) -> Void) {
        lock.lock(); defer { lock.unlock() }
        body(&_value)
    }
}

struct Signer {
    let privateKey: Curve25519.Signing.PrivateKey
    let kid: String

    init(kid: String = "test-1") {
        privateKey = Curve25519.Signing.PrivateKey()
        self.kid = kid
    }

    var publicKey: LicensePublicKey {
        LicensePublicKey(kid: kid, x: Base64URL.encode(privateKey.publicKey.rawRepresentation))
    }

    /// Canonical payload (sorted keys, no whitespace), like the server.
    func sign(_ overrides: [String: Any] = [:], issuedAt: Date = Date()) -> SignedLicense {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var fields: [String: Any] = [
            "v": 1, "key_sha256": Hashing.sha256Hex(testKey), "product_id": testProductId,
            "device_id": NSNull(), "valid": true, "reason": NSNull(), "plan": "pro",
            "expires_at": NSNull(), "test": false, "issued_at": formatter.string(from: issuedAt)
        ]
        for (k, v) in overrides { fields[k] = v }
        let data = try! JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys, .withoutEscapingSlashes])
        let payload = String(decoding: data, as: UTF8.self)
        let signature = try! privateKey.signature(for: Data(payload.utf8))
        return SignedLicense(payload: payload, signature: Base64URL.encode(signature), kid: kid)
    }
}

/// Fake Monemee server as a transport, with a switch for "offline".
final class FakeServer: MonemeeTransport, @unchecked Sendable {
    struct Call {
        let method: String
        let path: String
        let headers: [String: String]
        let body: [String: Any]?
    }

    let signer: Signer
    let state = Locked<(offline: Bool, valid: Bool, reason: String?, sign: Bool, status: Int, calls: [Call])>(
        (offline: false, valid: true, reason: nil, sign: true, status: 200, calls: []))
    /// Replaces the `signed` object of /validate responses.
    let overrideSigned = Locked<((String) -> SignedLicense)?>(nil)
    let clock: Locked<Date>

    init(signer: Signer = Signer(), clock: Locked<Date> = Locked(Date())) {
        self.signer = signer
        self.clock = clock
    }

    var calls: [Call] { state.value.calls }
    var offline: Bool { get { state.value.offline } set { state.mutate { $0.offline = newValue } } }

    func send(_ request: MonemeeHTTPRequest) async throws -> MonemeeHTTPResponse {
        let s = state.value
        if s.offline { throw URLError(.notConnectedToInternet) }
        let body = request.body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let path = request.url.path
        state.mutate { $0.calls.append(Call(method: request.method, path: path, headers: request.headers, body: body)) }
        if s.status != 200 {
            return json(["success": false, "message": "Too many requests"], status: s.status)
        }
        if path.hasSuffix("monemee-license-keys.json") {
            let k = signer.publicKey
            return json(["keys": [["kid": k.kid, "kty": "OKP", "crv": "Ed25519", "x": k.x]]])
        }
        if path.hasSuffix("/deactivate") {
            return json(["success": true, "data": ["deactivated": true, "activations": ["used": 0, "max": 3]]])
        }
        let device = body?["device_id"] as? String ?? ""
        var data: [String: Any] = [
            "valid": s.valid, "reason": s.valid ? NSNull() : (s.reason as Any? ?? NSNull()),
            "product_id": testProductId, "plan": "pro", "expires_at": NSNull(), "test": false,
            "activations": ["used": 1, "max": 3]
        ]
        if s.sign {
            let signed = overrideSigned.value.map { $0(device) }
                ?? signer.sign(["device_id": device, "valid": s.valid, "reason": s.valid ? NSNull() : (s.reason as Any? ?? NSNull())],
                               issuedAt: clock.value)
            data["signed"] = ["payload": signed.payload, "signature": signed.signature, "kid": signed.kid, "alg": "EdDSA"]
        }
        return json(["success": true, "data": data])
    }

    private func json(_ object: Any, status: Int = 200) -> MonemeeHTTPResponse {
        MonemeeHTTPResponse(status: status, body: try! JSONSerialization.data(withJSONObject: object))
    }
}

func makeLicense(server: FakeServer, storage: any LicenseStorage = InMemoryLicenseStorage(),
                 publicKeys: [LicensePublicKey]? = nil, graceDays: Double = 7,
                 machine: String? = nil) throws -> License {
    let clock = server.clock
    return try License(productId: testProductId, graceDays: graceDays, storage: storage,
                       publicKeys: publicKeys ?? [server.signer.publicKey],
                       machineIdentifier: { machine }, transport: server, now: { clock.value })
}

func decodeState(_ storage: InMemoryLicenseStorage) async throws -> [String: Any] {
    let stored = await storage.value(forKey: "state")
    let raw = try XCTUnwrap(stored)
    return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
}
