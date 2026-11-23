import Foundation
import XCTest
@testable import Monemee

final class SignatureTests: XCTestCase {
    func testSharedVectors() throws {
        let vectors = try Vectors.load()
        XCTAssertEqual(vectors.cases.count, 6)
        for c in vectors.cases {
            let payload = LicenseSignature.verify(c.signed, publicKeys: [vectors.publicKey])
            XCTAssertEqual(payload != nil, c.expect == "valid", c.name)
            if let payload {
                XCTAssertEqual(payload.productId, vectors.productId, c.name)
                XCTAssertEqual(payload.deviceId, vectors.deviceId, c.name)
                XCTAssertEqual(payload.issuedAt, vectors.issuedAt, c.name)
                XCTAssertEqual(payload.keySHA256, Hashing.sha256Hex(vectors.licenseKey), c.name)
                XCTAssertTrue(payload.valid, c.name)
            }
        }
    }

    func testVectorWithNonASCIIPlanAndExpiry() throws {
        let vectors = try Vectors.load()
        let c = try XCTUnwrap(vectors.cases.first { $0.name == "valid_with_expiry" })
        let payload = try XCTUnwrap(LicenseSignature.verify(c.signed, publicKeys: [vectors.publicKey]))
        XCTAssertEqual(payload.plan, "Lifetime – Pro")
        XCTAssertEqual(Timestamp.parse(payload.expiresAt), Date(timeIntervalSince1970: 1_798_761_600))
    }

    func testTamperedPayloadIsRejected() throws {
        let signer = Signer()
        let signed = signer.sign()
        XCTAssertEqual(LicenseSignature.verify(signed, publicKeys: [signer.publicKey])?.plan, "pro")
        let tampered = SignedLicense(payload: signed.payload.replacingOccurrences(of: "\"pro\"", with: "\"elite\""),
                                     signature: signed.signature, kid: signed.kid)
        XCTAssertNil(LicenseSignature.verify(tampered, publicKeys: [signer.publicKey]))
    }

    func testUnknownKidIsRejected() {
        let signer = Signer()
        let signed = signer.sign()
        let other = SignedLicense(payload: signed.payload, signature: signed.signature, kid: "anders")
        XCTAssertNil(LicenseSignature.verify(other, publicKeys: [signer.publicKey]))
        XCTAssertNil(LicenseSignature.verify(signed, publicKeys: []))
    }

    func testGarbageIsRejected() {
        let signer = Signer()
        let signed = signer.sign()
        XCTAssertNil(LicenseSignature.verify(SignedLicense(payload: signed.payload, signature: "!!", kid: "test-1"),
                                             publicKeys: [signer.publicKey]))
        XCTAssertNil(LicenseSignature.verify(signed, publicKeys: [LicensePublicKey(kid: "test-1", x: "short")]))
    }

    func testBundledKey() throws {
        let key = try XCTUnwrap(LicensePublicKey.bundled.first)
        XCTAssertEqual(key.kid, "mm-1")
        XCTAssertEqual(key.kty, "OKP")
        XCTAssertEqual(key.crv, "Ed25519")
        XCTAssertEqual(Base64URL.decode(key.x)?.count, 32)
    }

    func testBase64URLRoundTrip() {
        let data = Data((0..<64).map { UInt8($0 * 4 % 256) })
        let encoded = Base64URL.encode(data)
        XCTAssertFalse(encoded.contains("="))
        XCTAssertFalse(encoded.contains("+"))
        XCTAssertFalse(encoded.contains("/"))
        XCTAssertEqual(Base64URL.decode(encoded), data)
    }

    func testTimestampParsing() {
        XCTAssertEqual(Timestamp.parse("2026-11-20T10:00:00.000Z"), Date(timeIntervalSince1970: 1_795_168_800))
        XCTAssertEqual(Timestamp.parse("2026-11-20T10:00:00Z"), Date(timeIntervalSince1970: 1_795_168_800))
        XCTAssertNil(Timestamp.parse("gestern"))
        XCTAssertNil(Timestamp.parse(nil))
    }
}
