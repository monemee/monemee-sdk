import Foundation

/// Where ``License`` keeps the activated key, the last signed response, the device ID and
/// fetched public keys. Values are strings, keys are `state`, `device` and `keys`
/// (the same layout as `monemee-client`).
public protocol LicenseStorage: Sendable {
    func value(forKey key: String) async throws -> String?
    func setValue(_ value: String, forKey key: String) async throws
    func removeValue(forKey key: String) async throws
}

/// Keeps everything in memory. Useful for tests and previews.
public actor InMemoryLicenseStorage: LicenseStorage {
    public private(set) var values: [String: String]

    public init(_ values: [String: String] = [:]) {
        self.values = values
    }

    public func value(forKey key: String) -> String? { values[key] }
    public func setValue(_ value: String, forKey key: String) { values[key] = value }
    public func removeValue(forKey key: String) { values[key] = nil }
}

/// Stores a `license.json` file (a JSON object of strings, readable by `monemee-client`).
///
/// Default folder per platform:
/// - macOS and iOS: `Application Support/<appName>/` (inside the container for sandboxed apps)
/// - Linux: `$XDG_CONFIG_HOME/<appName>/` or `~/.config/<appName>/`
/// - Windows: `%APPDATA%\<appName>\`
///
/// The folder is created with mode `0700`, the file with `0600`.
public actor FileLicenseStorage: LicenseStorage {
    public nonisolated let fileURL: URL

    /// - Parameter directory: Folder that holds `license.json`.
    public init(directory: URL) {
        self.fileURL = directory.appendingPathComponent("license.json")
    }

    /// Uses ``defaultDirectory(appName:)``.
    public init(appName: String) {
        self.init(directory: FileLicenseStorage.defaultDirectory(appName: appName))
    }

    public static func defaultDirectory(appName: String) -> URL {
        let fm = FileManager.default
        #if os(Linux) || os(Android)
        let env = ProcessInfo.processInfo.environment
        if let xdg = env["XDG_CONFIG_HOME"], !xdg.isEmpty {
            return URL(fileURLWithPath: xdg, isDirectory: true).appendingPathComponent(appName, isDirectory: true)
        }
        return fm.homeDirectoryForCurrentUser.appendingPathComponent(".config", isDirectory: true)
            .appendingPathComponent(appName, isDirectory: true)
        #elseif os(Windows)
        if let appData = ProcessInfo.processInfo.environment["APPDATA"], !appData.isEmpty {
            return URL(fileURLWithPath: appData, isDirectory: true).appendingPathComponent(appName, isDirectory: true)
        }
        return fm.homeDirectoryForCurrentUser.appendingPathComponent(".config", isDirectory: true)
            .appendingPathComponent(appName, isDirectory: true)
        #else
        let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support", isDirectory: true)
        return base.appendingPathComponent(appName, isDirectory: true)
        #endif
    }

    public func value(forKey key: String) -> String? {
        readAll()[key]
    }

    public func setValue(_ value: String, forKey key: String) throws {
        var all = readAll()
        all[key] = value
        try writeAll(all)
    }

    public func removeValue(forKey key: String) throws {
        var all = readAll()
        guard all.removeValue(forKey: key) != nil else { return }
        try writeAll(all)
    }

    private func readAll() -> [String: String] {
        guard let data = try? Data(contentsOf: fileURL),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return object.compactMapValues { $0 as? String }
    }

    private func writeAll(_ values: [String: String]) throws {
        let fm = FileManager.default
        let dir = fileURL.deletingLastPathComponent()
        try fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let data = try JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])
        try data.write(to: fileURL, options: [.atomic])
        try? fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)
    }
}
