import Foundation
#if canImport(AppKit) && !targetEnvironment(macCatalyst)
import AppKit
#endif

/// Entry points that do not need a license object: the default server, the SDK version
/// and the buy link of a product.
public enum Monemee {
    /// The Monemee server used when no `baseURL` is passed.
    public static let defaultBaseURL = URL(string: "https://monemee.com")!

    /// Version of this Swift package, sent as part of the `User-Agent` header.
    public static let sdkVersion = "0.2.0"

    /// Link to the hosted checkout of a product: `<baseURL>/buy/<productId>`.
    ///
    /// - Parameters:
    ///   - productId: Your Monemee product ID.
    ///   - ref: Optional stable user ID of your app (max. 128 characters of `A-Z a-z 0-9 . _ : @ -`).
    ///     Never pass an email address.
    ///   - affiliate: Optional affiliate code, sent as `aff`.
    ///   - baseURL: Monemee server, `https://monemee.com` by default.
    /// - Throws: ``LicenseError`` with code ``LicenseError/Code/config`` for an invalid product ID
    ///   and ``LicenseError/Code/invalidRef`` for an invalid `ref`.
    public static func buyURL(productId: Int, ref: String? = nil, affiliate: String? = nil, baseURL: URL = defaultBaseURL) throws -> URL {
        guard productId > 0 else { throw LicenseError(code: .config, message: "productId is missing") }
        var queryItems: [URLQueryItem] = []
        if let ref, !ref.isEmpty {
            queryItems.append(URLQueryItem(name: "ref", value: try normalizeRef(ref)))
        }
        if let affiliate, !affiliate.isEmpty {
            queryItems.append(URLQueryItem(name: "aff", value: affiliate))
        }
        guard var components = URLComponents(string: "\(trimmedBase(baseURL))/buy/\(productId)") else {
            throw LicenseError(code: .config, message: "baseURL is not a valid URL")
        }
        if !queryItems.isEmpty { components.queryItems = queryItems }
        guard let url = components.url else { throw LicenseError(code: .config, message: "baseURL is not a valid URL") }
        return url
    }

    #if canImport(AppKit) && !targetEnvironment(macCatalyst)
    /// Opens the checkout of a product in the default browser (macOS).
    ///
    /// After paying, the buyer receives the license key by email and enters it in your app,
    /// which then calls ``License/activate(_:deviceName:)``.
    @MainActor
    @discardableResult
    public static func openBuyPage(productId: Int, ref: String? = nil, affiliate: String? = nil, baseURL: URL = defaultBaseURL) throws -> Bool {
        NSWorkspace.shared.open(try buyURL(productId: productId, ref: ref, affiliate: affiliate, baseURL: baseURL))
    }
    #endif

    static func normalizeRef(_ ref: String) throws -> String {
        let trimmed = ref.trimmingCharacters(in: .whitespacesAndNewlines)
        let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:@-")
        guard (1...128).contains(trimmed.count), trimmed.allSatisfy({ allowed.contains($0) }) else {
            throw LicenseError(code: .invalidRef, message: "ref must be a user ID (max. 128 characters of A-Z a-z 0-9 . _ : @ -)")
        }
        return trimmed
    }

    static func trimmedBase(_ url: URL) -> String {
        var s = url.absoluteString
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }
}
