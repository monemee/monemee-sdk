import Foundation
import XCTest
@testable import Monemee

final class DeviceIdentifierTests: XCTestCase {
    func testMachineIdentifierIsHashedPerProduct() async throws {
        let a = DeviceIdentifier.hashed("4C4C4544-0042-3510-8051-B7C04F4E3732", productId: 42)
        XCTAssertEqual(a, DeviceIdentifier.hashed("4C4C4544-0042-3510-8051-B7C04F4E3732", productId: 42))
        XCTAssertNotEqual(a, DeviceIdentifier.hashed("4C4C4544-0042-3510-8051-B7C04F4E3732", productId: 43))
        XCTAssertTrue(a.hasPrefix("d_"))
        XCTAssertEqual(a.count, 34)
        XCTAssertFalse(a.contains("4C4C4544"))
        XCTAssertEqual(a, "d_" + Hashing.sha256Hex("monemee-device:42:4C4C4544-0042-3510-8051-B7C04F4E3732").prefix(32))

        let server = FakeServer()
        let license = try makeLicense(server: server, storage: InMemoryLicenseStorage(), machine: "4C4C4544-0042-3510-8051-B7C04F4E3732")
        let device = try await license.deviceId()
        XCTAssertEqual(device, a)
    }

    func testWithoutMachineIdentifierARandomIdIsStoredOnce() async throws {
        let storage = InMemoryLicenseStorage()
        let first = try makeLicense(server: FakeServer(), storage: storage, machine: nil)
        let id = try await first.deviceId()
        XCTAssertTrue(id.hasPrefix("d_"))
        XCTAssertEqual(id.count, 34)
        let second = try makeLicense(server: FakeServer(), storage: storage, machine: nil)
        let again = try await second.deviceId()
        XCTAssertEqual(again, id)
        let stored = await storage.value(forKey: "device")
        XCTAssertEqual(stored, id)
    }

    func testFixedDeviceIdWinsAndIsTruncated() async throws {
        let license = try License(productId: 42, storage: InMemoryLicenseStorage(), deviceId: String(repeating: "x", count: 200),
                                  machineIdentifier: { "mac" }, transport: FakeServer())
        let id = try await license.deviceId()
        XCTAssertEqual(id.count, 128)
    }

    #if os(Linux) || os(macOS)
    func testThisMachineHasAnIdentifier() throws {
        // macOS: IOPlatformUUID, Linux: /etc/machine-id (present on systemd systems and most CI images).
        // Containers often ship an empty /etc/machine-id, so only count files with content.
        let hasMachineId = ["/etc/machine-id", "/var/lib/dbus/machine-id"].contains { path in
            guard let text = try? String(contentsOfFile: path, encoding: .utf8) else { return false }
            return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        #if os(Linux)
        try XCTSkipUnless(hasMachineId, "no machine-id on this system")
        #endif
        let id = try XCTUnwrap(DeviceIdentifier.machineIdentifier())
        XCTAssertFalse(id.isEmpty)
    }
    #endif
}

final class BuyURLTests: XCTestCase {
    func testBuyURL() throws {
        XCTAssertEqual(try Monemee.buyURL(productId: 123).absoluteString, "https://monemee.com/buy/123")
        XCTAssertEqual(try Monemee.buyURL(productId: 123, ref: " user_1 ").absoluteString, "https://monemee.com/buy/123?ref=user_1")
        XCTAssertEqual(try Monemee.buyURL(productId: 123, ref: "u1", affiliate: "anna").absoluteString,
                       "https://monemee.com/buy/123?ref=u1&aff=anna")
        XCTAssertEqual(try Monemee.buyURL(productId: 7, baseURL: URL(string: "http://localhost:5000/")!).absoluteString,
                       "http://localhost:5000/buy/7")
        let license = try License(productId: 9, storage: InMemoryLicenseStorage(), transport: FakeServer())
        XCTAssertEqual(try license.buyURL(ref: "a@b:c.d-e").absoluteString, "https://monemee.com/buy/9?ref=a@b:c.d-e")
    }

    func testInvalidRefAndProduct() {
        for ref in ["mit leerzeichen", "ä", String(repeating: "a", count: 129)] {
            XCTAssertThrowsError(try Monemee.buyURL(productId: 1, ref: ref)) { error in
                XCTAssertEqual((error as? LicenseError)?.code, .invalidRef)
            }
        }
        XCTAssertThrowsError(try Monemee.buyURL(productId: 0)) { error in
            XCTAssertEqual((error as? LicenseError)?.code, .config)
        }
    }
}
