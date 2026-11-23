import Foundation

/// Error thrown by ``License`` and ``Monemee``.
///
/// `check()` does not throw for connection problems: without a connection it falls back to
/// the last signed response. `activate(_:)` and `deactivate()` need a connection and throw.
public struct LicenseError: Error, Sendable, Equatable, LocalizedError, CustomStringConvertible {
    /// Machine-readable error code, the same strings as in the JavaScript and Python SDKs.
    public struct Code: RawRepresentable, Hashable, Sendable, CustomStringConvertible {
        public let rawValue: String
        public init(rawValue: String) { self.rawValue = rawValue }
        public var description: String { rawValue }

        /// Invalid configuration, for example a missing product ID.
        public static let config = Code(rawValue: "CONFIG")
        /// The key does not match the format `MM-XXXX-XXXX-XXXX-XXXX`. No request was sent.
        public static let invalidKey = Code(rawValue: "INVALID_KEY")
        /// The `ref` passed to a buy link is not a valid user ID.
        public static let invalidRef = Code(rawValue: "INVALID_REF")
        /// Monemee answered with HTTP 429.
        public static let rateLimited = Code(rawValue: "RATE_LIMITED")
        /// Monemee answered with an error status or an unreadable body.
        public static let server = Code(rawValue: "SERVER")
        /// Monemee could not be reached (no connection, DNS, TLS, timeout).
        public static let network = Code(rawValue: "NETWORK")
    }

    public let code: Code
    public let message: String
    /// HTTP status code, if Monemee answered.
    public let status: Int?

    public init(code: Code, message: String, status: Int? = nil) {
        self.code = code
        self.message = message
        self.status = status
    }

    public var errorDescription: String? { message }
    public var description: String { "LicenseError(\(code.rawValue)): \(message)" }

    /// Errors after which `check()` uses the stored offline proof.
    var isConnectivity: Bool { code == .network || code == .server || code == .rateLimited }
}
