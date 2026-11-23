import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// A plain HTTP request sent by ``License``.
public struct MonemeeHTTPRequest: Sendable, Equatable {
    public var method: String
    public var url: URL
    public var headers: [String: String]
    public var body: Data?

    public init(method: String, url: URL, headers: [String: String] = [:], body: Data? = nil) {
        self.method = method
        self.url = url
        self.headers = headers
        self.body = body
    }
}

/// A plain HTTP response.
public struct MonemeeHTTPResponse: Sendable, Equatable {
    public var status: Int
    public var body: Data

    public init(status: Int, body: Data) {
        self.status = status
        self.body = body
    }
}

/// Sends HTTP requests. The default is ``URLSessionTransport``; inject your own for tests
/// or a custom networking stack. Throw any error for connection failures.
public protocol MonemeeTransport: Sendable {
    func send(_ request: MonemeeHTTPRequest) async throws -> MonemeeHTTPResponse
}

/// ``MonemeeTransport`` backed by `URLSession`.
public struct URLSessionTransport: MonemeeTransport, @unchecked Sendable {
    public let session: URLSession
    /// Seconds per request.
    public let timeout: TimeInterval

    public init(session: URLSession = .shared, timeout: TimeInterval = 8) {
        self.session = session
        self.timeout = timeout
    }

    public func send(_ request: MonemeeHTTPRequest) async throws -> MonemeeHTTPResponse {
        var urlRequest = URLRequest(url: request.url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        urlRequest.httpMethod = request.method
        for (name, value) in request.headers { urlRequest.setValue(value, forHTTPHeaderField: name) }
        urlRequest.httpBody = request.body
        let session = self.session
        return try await withCheckedThrowingContinuation { continuation in
            let task = session.dataTask(with: urlRequest) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let http = response as? HTTPURLResponse {
                    continuation.resume(returning: MonemeeHTTPResponse(status: http.statusCode, body: data ?? Data()))
                } else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                }
            }
            task.resume()
        }
    }
}
