import Foundation
import XCTest
@testable import Monemee

final class LicenseTests: XCTestCase {
    func testActivateAndCheckOnlineNormalizesKeyAndKeepsDeviceId() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server)
        let activated = try await license.activate(" mm-a7k2-9fq3-xt8m-2b4c ")
        XCTAssertTrue(activated.valid)
        XCTAssertEqual(activated.activations, LicenseActivations(used: 1, max: 3))

        let first = try XCTUnwrap(server.calls.first)
        XCTAssertEqual(first.method, "POST")
        XCTAssertEqual(first.path, "/api/v1/licenses/activate")
        XCTAssertEqual(first.headers["Content-Type"], "application/json")
        XCTAssertEqual(first.headers["Accept"], "application/json")
        XCTAssertEqual(first.body?["key"] as? String, testKey)
        XCTAssertEqual(first.body?["product_id"] as? Int, testProductId)
        XCTAssertNil(first.body?["device_name"])
        let device = try XCTUnwrap(first.body?["device_id"] as? String)
        XCTAssertTrue(device.hasPrefix("d_"))
        XCTAssertEqual(device.count, 34)

        let checked = try await license.check()
        XCTAssertEqual(checked.valid, true)
        XCTAssertEqual(checked.plan, "pro")
        XCTAssertFalse(checked.offline)
        let validate = try XCTUnwrap(server.calls.first { $0.path.hasSuffix("/validate") })
        XCTAssertEqual(validate.body?["device_id"] as? String, device)
        let stored = await license.storedKey()
        XCTAssertEqual(stored, testKey)
    }

    func testDeviceNameIsSent() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server)
        try await license.activate(testKey, deviceName: "MacBook Pro")
        XCTAssertEqual(server.calls.first?.body?["device_name"] as? String, "MacBook Pro")
    }

    func testOfflineGracePeriod() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server, graceDays: 7)
        try await license.activate(testKey)
        _ = try await license.check()
        server.offline = true

        let offline = try await license.check()
        XCTAssertEqual(offline.valid, true)
        XCTAssertTrue(offline.offline)
        XCTAssertEqual(offline.plan, "pro")

        server.clock.value = server.clock.value.addingTimeInterval(6.9 * 86_400)
        let stillValid = try await license.check()
        XCTAssertTrue(stillValid.valid)

        server.clock.value = server.clock.value.addingTimeInterval(1.2 * 86_400)
        let late = try await license.check()
        XCTAssertEqual(late.valid, false)
        XCTAssertEqual(late.reason, .offline)
        XCTAssertTrue(late.offline)
    }

    func testCustomGraceDays() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server, graceDays: 1)
        try await license.activate(testKey)
        _ = try await license.check()
        server.offline = true
        server.clock.value = server.clock.value.addingTimeInterval(2 * 86_400)
        let result = try await license.check()
        XCTAssertEqual(result.reason, .offline)
    }

    func testOfflineRejectsTamperedOrForeignResponse() async throws {
        let server = FakeServer()
        let storage = InMemoryLicenseStorage()
        let license = try makeLicense(server: server, storage: storage)
        try await license.activate(testKey)
        _ = try await license.check()
        var state = try await decodeState(storage)
        let signed = try XCTUnwrap(state["signed"] as? [String: Any])
        let payload = try XCTUnwrap(signed["payload"] as? String)
        server.offline = true

        // Payload changed (other plan), signature kept
        var tampered = signed
        tampered["payload"] = payload.replacingOccurrences(of: "\"pro\"", with: "\"elite\"")
        state["signed"] = tampered
        await storage.setValue(String(decoding: try JSONSerialization.data(withJSONObject: state), as: UTF8.self), forKey: "state")
        let r1 = try await license.check()
        XCTAssertEqual(r1.valid, false)
        XCTAssertEqual(r1.reason, .offline)

        // Signed with a foreign key under the same kid
        let device = try await license.deviceId()
        let evil = Signer().sign(["device_id": device], issuedAt: server.clock.value)
        state["signed"] = ["payload": evil.payload, "signature": evil.signature, "kid": evil.kid]
        await storage.setValue(String(decoding: try JSONSerialization.data(withJSONObject: state), as: UTF8.self), forKey: "state")
        let r2 = try await license.check()
        XCTAssertEqual(r2.valid, false)
    }

    func testOfflineRejectsResponseForOtherDeviceOrProductOrKey() async throws {
        for overrides in [["device_id": "d_other"], ["product_id": 7], ["key_sha256": Hashing.sha256Hex("MM-AAAA-AAAA-AAAA-AAAA")]] as [[String: Any]] {
            let server = FakeServer()
            let license = try makeLicense(server: server)
            try await license.activate(testKey)
            let signer = server.signer
            let clock = server.clock
            server.overrideSigned.value = { device in
                var fields = overrides
                if fields["device_id"] == nil { fields["device_id"] = device }
                return signer.sign(fields, issuedAt: clock.value)
            }
            let online = try await license.check()
            XCTAssertEqual(online.reason, .invalidSignature, "\(overrides)")
        }
    }

    func testOfflineExpiredLicense() async throws {
        let server = FakeServer()
        let signer = server.signer
        let clock = server.clock
        server.overrideSigned.value = { device in
            signer.sign(["device_id": device, "expires_at": "2000-01-01T00:00:00.000Z"], issuedAt: clock.value)
        }
        let license = try makeLicense(server: server)
        try await license.activate(testKey)
        server.offline = true
        let result = try await license.check()
        XCTAssertEqual(result.valid, false)
        XCTAssertEqual(result.reason, .expired)
        XCTAssertTrue(result.offline)
    }

    func testRevokedForgetsKey() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server)
        try await license.activate(testKey)
        server.state.mutate { $0.valid = false; $0.reason = "revoked" }
        let result = try await license.check()
        XCTAssertEqual(result.valid, false)
        XCTAssertEqual(result.reason, .revoked)
        let stored = await license.storedKey()
        XCTAssertNil(stored)
        let again = try await license.check()
        XCTAssertEqual(again.reason, .notActivated)
    }

    func testActivationLimitIsAResultNotAnError() async throws {
        let server = FakeServer()
        server.state.mutate { $0.valid = false; $0.reason = "activation_limit" }
        let license = try makeLicense(server: server)
        let result = try await license.activate(testKey)
        XCTAssertEqual(result.valid, false)
        XCTAssertEqual(result.reason, .activationLimit)
        let stored = await license.storedKey()
        XCTAssertNil(stored)
    }

    func testNotActivatedAndInvalidFormatWithoutNetwork() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server)
        let result = try await license.check()
        XCTAssertEqual(result.reason, .notActivated)
        do {
            try await license.activate("quatsch")
            XCTFail("expected an error")
        } catch let error as LicenseError {
            XCTAssertEqual(error.code, .invalidKey)
        }
        XCTAssertTrue(server.calls.isEmpty)
    }

    func testKeyFormat() {
        XCTAssertTrue(License.isValidKeyFormat("MM-A7K2-9FQ3-XT8M-2B4C"))
        XCTAssertEqual(License.normalizeKey(" mm-a7k2-9fq3 -xt8m-2b4c\n"), "MM-A7K2-9FQ3-XT8M-2B4C")
        for bad in ["MM-A7K2-9FQ3-XT8M", "XX-A7K2-9FQ3-XT8M-2B4C", "MM-A7K2-9FQ3-XT8M-2B4", "MM-A7K2-9FQ3-XT8M-2B4C-", "MM-Ä7K2-9FQ3-XT8M-2B4C", ""] {
            XCTAssertFalse(License.isValidKeyFormat(bad), bad)
        }
    }

    func testUnsignedServerOnlineOkButNoOfflineFreePass() async throws {
        let server = FakeServer()
        server.state.mutate { $0.sign = false }
        let license = try makeLicense(server: server)
        try await license.activate(testKey)
        let online = try await license.check()
        XCTAssertTrue(online.valid)
        server.offline = true
        let offline = try await license.check()
        XCTAssertEqual(offline.valid, false)
        XCTAssertEqual(offline.reason, .offline)
    }

    func testWrongOnlineSignatureIsRejectedAndNotStored() async throws {
        let server = FakeServer()
        let storage = InMemoryLicenseStorage()
        let license = try makeLicense(server: server, storage: storage)
        try await license.activate(testKey)
        let before = await storage.value(forKey: "state")
        let evil = Signer()
        let clock = server.clock
        server.overrideSigned.value = { device in evil.sign(["device_id": device], issuedAt: clock.value) }
        let result = try await license.check()
        XCTAssertEqual(result.valid, false)
        XCTAssertEqual(result.reason, .invalidSignature)
        let after = await storage.value(forKey: "state")
        XCTAssertEqual(after, before)
    }

    func testOnlineSignatureMustMatchValidFlag() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server)
        try await license.activate(testKey)
        let signer = server.signer
        let clock = server.clock
        // Signed payload says invalid, unsigned envelope says valid → do not trust
        server.overrideSigned.value = { device in signer.sign(["device_id": device, "valid": false, "reason": "revoked"], issuedAt: clock.value) }
        let result = try await license.check()
        XCTAssertEqual(result.reason, .invalidSignature)
    }

    func testOldOnlineResponseIsRejected() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server)
        try await license.activate(testKey)
        let signer = server.signer
        let clock = server.clock
        server.overrideSigned.value = { device in signer.sign(["device_id": device], issuedAt: clock.value.addingTimeInterval(-3600)) }
        let result = try await license.check()
        XCTAssertEqual(result.reason, .invalidSignature)
    }

    func testUnknownKidIsFetchedFromWellKnownAndRemembered() async throws {
        let server = FakeServer()
        let storage = InMemoryLicenseStorage()
        // Only the bundled Monemee key is trusted up front; the server signs with "test-1".
        let license = try makeLicense(server: server, storage: storage, publicKeys: [])
        try await license.activate(testKey)
        let result = try await license.check()
        XCTAssertTrue(result.valid)
        XCTAssertEqual(server.calls.filter { $0.path == "/.well-known/monemee-license-keys.json" }.count, 1)
        XCTAssertEqual(server.calls.first { $0.path.hasSuffix("keys.json") }?.method, "GET")
        let cachedKeys = await storage.value(forKey: "keys")
        XCTAssertNotNil(cachedKeys)

        // A new instance with the same storage uses the remembered key, also offline.
        let second = try makeLicense(server: server, storage: storage, publicKeys: [])
        server.offline = true
        let offline = try await second.check()
        XCTAssertTrue(offline.valid)
        XCTAssertTrue(offline.offline)
        XCTAssertEqual(server.calls.filter { $0.path.hasSuffix("keys.json") }.count, 1)
    }

    func testUnknownKidThatTheKeyEndpointDoesNotKnowIsRejected() async throws {
        // Licenses are signed with "mm-99", the key endpoint only publishes "mm-2".
        let mixed = MixedTransport(main: FakeServer(signer: Signer(kid: "mm-99")), keys: FakeServer(signer: Signer(kid: "mm-2")))
        let license = try License(productId: testProductId, storage: InMemoryLicenseStorage(),
                                  machineIdentifier: { "mac-1" }, transport: mixed, now: { Date() })
        try await license.activate(testKey)
        let result = try await license.check()
        XCTAssertEqual(result.reason, .invalidSignature)
    }

    func testRateLimitAndServerErrorsFallBackToOfflineProof() async throws {
        for status in [429, 500, 503] {
            let server = FakeServer()
            let license = try makeLicense(server: server)
            try await license.activate(testKey)
            _ = try await license.check()
            server.state.mutate { $0.status = status }
            let result = try await license.check()
            XCTAssertTrue(result.valid, "\(status)")
            XCTAssertTrue(result.offline, "\(status)")
        }
    }

    func testActivateErrorsCarryCodeAndMessage() async throws {
        let server = FakeServer()
        server.state.mutate { $0.status = 429 }
        let license = try makeLicense(server: server)
        do {
            try await license.activate(testKey)
            XCTFail("expected an error")
        } catch let error as LicenseError {
            XCTAssertEqual(error.code, .rateLimited)
            XCTAssertEqual(error.status, 429)
            XCTAssertEqual(error.message, "Too many requests")
        }
        server.state.mutate { $0.status = 200 }
        server.offline = true
        do {
            try await license.activate(testKey)
            XCTFail("expected an error")
        } catch let error as LicenseError {
            XCTAssertEqual(error.code, .network)
        }
    }

    func testDeactivateFreesDeviceAndForgetsKey() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server)
        try await license.activate(testKey)
        let deactivated = try await license.deactivate()
        XCTAssertTrue(deactivated)
        XCTAssertEqual(server.calls.last?.path, "/api/v1/licenses/deactivate")
        let stored = await license.storedKey()
        XCTAssertNil(stored)
        let again = try await license.deactivate()
        XCTAssertFalse(again)
    }

    func testDeactivateForgetsKeyEvenWhenOffline() async throws {
        let server = FakeServer()
        let license = try makeLicense(server: server)
        try await license.activate(testKey)
        server.offline = true
        do {
            try await license.deactivate()
            XCTFail("expected an error")
        } catch let error as LicenseError {
            XCTAssertEqual(error.code, .network)
        }
        let stored = await license.storedKey()
        XCTAssertNil(stored)
    }

    func testInvalidProductIdThrows() {
        XCTAssertThrowsError(try License(productId: 0, storage: InMemoryLicenseStorage())) { error in
            XCTAssertEqual((error as? LicenseError)?.code, .config)
        }
    }

    func testCustomBaseURL() async throws {
        let server = FakeServer()
        let clock = server.clock
        let license = try License(productId: testProductId, baseURL: URL(string: "https://staging.example.com/")!,
                                  storage: InMemoryLicenseStorage(), publicKeys: [server.signer.publicKey],
                                  machineIdentifier: { nil }, transport: RecordingTransport(inner: server), now: { clock.value })
        try await license.activate(testKey)
        XCTAssertEqual(RecordingTransport.lastURL.value?.absoluteString, "https://staging.example.com/api/v1/licenses/activate")
    }
}

/// Main server for licenses, a second server for the key endpoint.
struct MixedTransport: MonemeeTransport {
    let main: FakeServer
    let keys: FakeServer

    func send(_ request: MonemeeHTTPRequest) async throws -> MonemeeHTTPResponse {
        request.url.path.hasSuffix("keys.json") ? try await keys.send(request) : try await main.send(request)
    }
}

struct RecordingTransport: MonemeeTransport {
    static let lastURL = Locked<URL?>(nil)
    let inner: FakeServer

    func send(_ request: MonemeeHTTPRequest) async throws -> MonemeeHTTPResponse {
        RecordingTransport.lastURL.value = request.url
        return try await inner.send(request)
    }
}
