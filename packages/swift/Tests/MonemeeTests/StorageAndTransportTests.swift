import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import Monemee

final class FileLicenseStorageTests: XCTestCase {
    func testRoundTripPermissionsAndJSClientLayout() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("monemee-swift-\(UUID().uuidString)/sub")
        defer { try? FileManager.default.removeItem(at: dir.deletingLastPathComponent()) }
        let storage = FileLicenseStorage(directory: dir)
        let empty = await storage.value(forKey: "state")
        XCTAssertNil(empty)

        let server = FakeServer()
        let license = try makeLicense(server: server, storage: storage, machine: nil)
        try await license.activate(testKey)

        // Same file layout as monemee-client under Node: a JSON object of strings.
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: storage.fileURL)) as? [String: String])
        XCTAssertNotNil(object["device"])
        let state = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(try XCTUnwrap(object["state"]).utf8)) as? [String: Any])
        XCTAssertEqual(state["key"] as? String, testKey)
        XCTAssertEqual(state["v"] as? Int, 1)
        XCTAssertNotNil(state["signed"] as? [String: Any])
        XCTAssertNotNil(state["checkedAt"] as? Double)

        #if !os(Windows)
        let fileMode = try FileManager.default.attributesOfItem(atPath: storage.fileURL.path)[.posixPermissions] as? Int
        XCTAssertEqual(fileMode, 0o600)
        let dirMode = try FileManager.default.attributesOfItem(atPath: dir.path)[.posixPermissions] as? Int
        XCTAssertEqual(dirMode, 0o700)
        #endif

        // A second instance reads the stored state, and offline works from the file.
        let second = try makeLicense(server: server, storage: FileLicenseStorage(directory: dir), machine: nil)
        server.offline = true
        let result = try await second.check()
        XCTAssertTrue(result.valid)
        XCTAssertTrue(result.offline)

        try await storage.removeValue(forKey: "state")
        let removed = await storage.value(forKey: "state")
        XCTAssertNil(removed)
    }

    func testReadsStateWrittenByJSClient() async throws {
        let storage = InMemoryLicenseStorage(["state": #"{"key":"MM-A7K2-9FQ3-XT8M-2B4C","signed":null,"checkedAt":1795168800000,"v":1}"#])
        let license = try makeLicense(server: FakeServer(), storage: storage)
        let key = await license.storedKey()
        XCTAssertEqual(key, testKey)
        let wrongVersion = InMemoryLicenseStorage(["state": #"{"key":"MM-A7K2-9FQ3-XT8M-2B4C","v":2}"#])
        let other = try makeLicense(server: FakeServer(), storage: wrongVersion)
        let none = await other.storedKey()
        XCTAssertNil(none)
    }

    func testDefaultDirectory() {
        let dir = FileLicenseStorage.defaultDirectory(appName: "monemee-42")
        XCTAssertEqual(dir.lastPathComponent, "monemee-42")
        #if os(Linux)
        let env = ProcessInfo.processInfo.environment
        if let xdg = env["XDG_CONFIG_HOME"], !xdg.isEmpty {
            XCTAssertEqual(dir.deletingLastPathComponent().path, URL(fileURLWithPath: xdg).path)
        } else {
            XCTAssertEqual(dir.deletingLastPathComponent().lastPathComponent, ".config")
        }
        #elseif os(macOS)
        XCTAssertEqual(dir.deletingLastPathComponent().lastPathComponent, "Application Support")
        #endif
    }
}

/// URLProtocol that answers every request with a canned license response.
final class MockURLProtocol: URLProtocol {
    static let requests = Locked<[(method: String, url: URL, headers: [String: String], body: Data?)]>([])
    static let responseBody = Locked<Data>(Data())

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        var body = request.httpBody
        if body == nil, let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            stream.close()
            body = data
        }
        MockURLProtocol.requests.mutate {
            $0.append((request.httpMethod ?? "", request.url!, request.allHTTPHeaderFields ?? [:], body))
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: MockURLProtocol.responseBody.value)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class URLSessionTransportTests: XCTestCase {
    func testRequestBuildingThroughURLSession() async throws {
        let signer = Signer()
        let device = "d_fixed"
        let signed = signer.sign(["device_id": device])
        let response: [String: Any] = ["success": true, "data": [
            "valid": true, "reason": NSNull(), "plan": "Pro", "expires_at": "2027-01-01T00:00:00.000Z", "test": true,
            "activations": ["used": 2, "max": NSNull()],
            "signed": ["payload": signed.payload, "signature": signed.signature, "kid": signed.kid, "alg": "EdDSA"]
        ]]
        MockURLProtocol.responseBody.value = try JSONSerialization.data(withJSONObject: response)
        MockURLProtocol.requests.value = []

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let transport = URLSessionTransport(session: URLSession(configuration: config))
        let license = try License(productId: testProductId, storage: InMemoryLicenseStorage(), deviceId: device,
                                  deviceName: "Studio", publicKeys: [signer.publicKey], transport: transport)

        let result = try await license.activate(testKey)
        XCTAssertTrue(result.valid)
        XCTAssertEqual(result.plan, "Pro")
        XCTAssertTrue(result.test)
        XCTAssertEqual(result.expiresAt, Date(timeIntervalSince1970: 1_798_761_600))
        XCTAssertEqual(result.activations, LicenseActivations(used: 2, max: nil))

        let request = try XCTUnwrap(MockURLProtocol.requests.value.first)
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.url.absoluteString, "https://monemee.com/api/v1/licenses/activate")
        XCTAssertEqual(request.headers["Content-Type"], "application/json")
        XCTAssertEqual(request.headers["User-Agent"], "monemee-swift/\(Monemee.sdkVersion)")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.body)) as? [String: Any])
        XCTAssertEqual(body["key"] as? String, testKey)
        XCTAssertEqual(body["product_id"] as? Int, testProductId)
        XCTAssertEqual(body["device_id"] as? String, device)
        XCTAssertEqual(body["device_name"] as? String, "Studio")
        XCTAssertNil(body["client_secret"])

        let checked = try await license.check()
        XCTAssertTrue(checked.valid)
        XCTAssertEqual(MockURLProtocol.requests.value.last?.url.path, "/api/v1/licenses/validate")
    }

    func testMalformedSignedObjectCountsAsInvalidSignature() async throws {
        let response: [String: Any] = ["success": true, "data": ["valid": true, "signed": ["payload": 1]]]
        MockURLProtocol.responseBody.value = try JSONSerialization.data(withJSONObject: response)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let license = try License(productId: testProductId, storage: InMemoryLicenseStorage(), deviceId: "d_x",
                                  transport: URLSessionTransport(session: URLSession(configuration: config)))
        try await license.activate(testKey)
        let result = try await license.check()
        XCTAssertEqual(result.reason, .invalidSignature)
    }
}
