import Foundation

/// License key of one product on this device, for downloadable apps.
///
/// ```swift
/// let license = try License(productId: 123)
/// try await license.activate("MM-XXXX-XXXX-XXXX-XXXX")   // once
/// let result = try await license.check()                  // on every start
/// if result.valid { unlockPro(plan: result.plan) }
/// ```
///
/// Every response from Monemee is signed with Ed25519. ``check()`` verifies the signature and
/// stores the last valid response. Without a connection that response counts for
/// `graceDays` (default 7), reported as ``LicenseResult/offline``. Tampered, foreign or
/// expired responses are rejected. The client holds no secrets.
public actor License {
    static let storeVersion = 1
    static let onlineMaxAge: TimeInterval = 600
    static let clockSkew: TimeInterval = 300

    public nonisolated let productId: Int
    public nonisolated let baseURL: URL
    /// How long the last signed response counts without a connection.
    public nonisolated let graceDays: Double

    private let storage: any LicenseStorage
    private let transport: any MonemeeTransport
    private let fixedDeviceId: String?
    private let deviceName: String?
    private let machineIdentifier: @Sendable () -> String?
    private let now: @Sendable () -> Date
    private var keys: [LicensePublicKey]

    /// - Parameters:
    ///   - productId: Your Monemee product ID.
    ///   - baseURL: Monemee server, `https://monemee.com` by default.
    ///   - graceDays: How long the last signed response counts without a connection. Default 7.
    ///   - appName: Folder name for the default ``FileLicenseStorage``. Default `monemee-<productId>`.
    ///   - storage: Custom storage, for example the Keychain. Overrides `appName`.
    ///   - deviceId: Fixed device ID (max. 128 characters). By default it is derived from the
    ///     machine identifier, see ``DeviceIdentifier``.
    ///   - deviceName: Shown in the device list of your dashboard.
    ///   - publicKeys: Additional trusted public keys. The bundled Monemee keys are always included.
    ///   - machineIdentifier: Source of the machine identifier. Return `nil` to use a stored random ID.
    ///   - transport: HTTP client. Default ``URLSessionTransport``.
    ///   - now: Clock, injectable for tests.
    /// - Throws: ``LicenseError`` with code ``LicenseError/Code/config`` if `productId` is not positive.
    public init(
        productId: Int,
        baseURL: URL = Monemee.defaultBaseURL,
        graceDays: Double = 7,
        appName: String? = nil,
        storage: (any LicenseStorage)? = nil,
        deviceId: String? = nil,
        deviceName: String? = nil,
        publicKeys: [LicensePublicKey] = [],
        machineIdentifier: @escaping @Sendable () -> String? = { DeviceIdentifier.machineIdentifier() },
        transport: any MonemeeTransport = URLSessionTransport(),
        now: @escaping @Sendable () -> Date = { Date() }
    ) throws {
        guard productId > 0 else { throw LicenseError(code: .config, message: "productId is missing") }
        self.productId = productId
        self.baseURL = baseURL
        self.graceDays = graceDays
        self.storage = storage ?? FileLicenseStorage(appName: appName ?? "monemee-\(productId)")
        self.fixedDeviceId = deviceId.flatMap { $0.isEmpty ? nil : String($0.prefix(128)) }
        self.deviceName = deviceName
        self.keys = publicKeys + LicensePublicKey.bundled
        self.machineIdentifier = machineIdentifier
        self.transport = transport
        self.now = now
    }

    // MARK: - Public API

    /// Activates a key on this device, once. Accepts lowercase input and surrounding spaces.
    ///
    /// - Returns: The result. `valid == false` with a ``LicenseResult/reason`` such as
    ///   ``LicenseReason/activationLimit`` is a normal answer, not an error.
    /// - Throws: ``LicenseError`` with code ``LicenseError/Code/invalidKey`` for a malformed key
    ///   (no request is sent), or a network or server error.
    @discardableResult
    public func activate(_ rawKey: String, deviceName: String? = nil) async throws -> LicenseResult {
        let key = License.normalizeKey(rawKey)
        guard License.isValidKeyFormat(key) else {
            throw LicenseError(code: .invalidKey, message: "Enter the key in the format MM-XXXX-XXXX-XXXX-XXXX")
        }
        let device = try await deviceId()
        let data = try await post("activate", LicenseRequestBody(key: key, productId: productId, deviceId: device,
                                                                  deviceName: deviceName ?? self.deviceName))
        if data.valid == true {
            try await save(StoredState(key: key, signed: data.signed, checkedAt: nowMillis()))
        }
        return result(from: data)
    }

    /// Is the license valid? Asks Monemee; without a connection the last signed response
    /// counts for `graceDays`.
    ///
    /// Does not throw for connection problems: it returns ``LicenseReason/offline`` when there
    /// is no valid stored response. A revoked or unknown key is forgotten, the next call
    /// returns ``LicenseReason/notActivated``.
    public func check() async throws -> LicenseResult {
        guard let state = await load() else { return LicenseResult(valid: false, reason: .notActivated) }
        let device = try await deviceId()

        let data: LicenseResponseData
        do {
            data = try await post("validate", LicenseRequestBody(key: state.key, productId: productId, deviceId: device))
        } catch let error as LicenseError where error.isConnectivity {
            guard let signed = state.signed,
                  let payload = await trusted(signed, key: state.key, device: device, maxAge: graceDays * 86_400) else {
                return LicenseResult(valid: false, reason: .offline, offline: true)
            }
            return result(from: payload, offline: true)
        }

        if data.signedMalformed {
            return LicenseResult(valid: false, reason: .invalidSignature)
        }
        if let signed = data.signed {
            // Online answers are signed too; a wrong signature means a tampered response.
            if let payload = await trusted(signed, key: state.key, device: device, maxAge: License.onlineMaxAge),
               payload.valid == (data.valid ?? false) {
                try await save(StoredState(key: state.key, signed: signed, checkedAt: nowMillis()))
            } else {
                return LicenseResult(valid: false, reason: .invalidSignature)
            }
        } else {
            try await save(StoredState(key: state.key, signed: state.signed, checkedAt: nowMillis()))
        }
        if data.valid != true, let reason = data.reason, [.revoked, .notFound, .productMismatch].contains(reason) {
            try await storage.removeValue(forKey: "state")
        }
        return result(from: data)
    }

    /// Frees this device (for example before moving to a new computer) and forgets the key.
    ///
    /// - Returns: `true` if Monemee released the device, `false` if no key was stored.
    @discardableResult
    public func deactivate() async throws -> Bool {
        guard let state = await load() else { return false }
        let device = try await deviceId()
        let data: LicenseResponseData
        do {
            data = try await post("deactivate", LicenseRequestBody(key: state.key, productId: productId, deviceId: device))
        } catch {
            try? await storage.removeValue(forKey: "state")
            throw error
        }
        try await storage.removeValue(forKey: "state")
        return data.deactivated ?? false
    }

    /// The stored key, or `nil` if none is activated.
    public func storedKey() async -> String? {
        await load()?.key
    }

    /// The device ID sent to Monemee.
    public func deviceId() async throws -> String {
        if let fixedDeviceId { return fixedDeviceId }
        if let machine = machineIdentifier(), !machine.isEmpty {
            return DeviceIdentifier.hashed(machine, productId: productId)
        }
        if let stored = try? await storage.value(forKey: "device"), !stored.isEmpty { return stored }
        let id = DeviceIdentifier.random()
        try await storage.setValue(id, forKey: "device")
        return id
    }

    /// Buy link of this product, see ``Monemee/buyURL(productId:ref:affiliate:baseURL:)``.
    public nonisolated func buyURL(ref: String? = nil, affiliate: String? = nil) throws -> URL {
        try Monemee.buyURL(productId: productId, ref: ref, affiliate: affiliate, baseURL: baseURL)
    }

    // MARK: - Key format

    static func normalizeKey(_ key: String) -> String {
        String(key.uppercased().filter { !$0.isWhitespace })
    }

    static func isValidKeyFormat(_ key: String) -> Bool {
        let parts = key.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 5, parts[0] == "MM" else { return false }
        return parts.dropFirst().allSatisfy { part in
            part.count == 4 && part.allSatisfy { ("A"..."Z").contains($0) || ("0"..."9").contains($0) }
        }
    }

    // MARK: - Storage

    private func load() async -> StoredState? {
        guard let raw = try? await storage.value(forKey: "state"),
              let state = try? JSONDecoder().decode(StoredState.self, from: Data(raw.utf8)),
              state.v == License.storeVersion, !state.key.isEmpty else { return nil }
        return state
    }

    private func save(_ state: StoredState) async throws {
        let data = try JSONEncoder().encode(state)
        try await storage.setValue(String(decoding: data, as: UTF8.self), forKey: "state")
    }

    private func nowMillis() -> Double { (now().timeIntervalSince1970 * 1000).rounded() }

    // MARK: - Network

    private var apiBase: String { Monemee.trimmedBase(baseURL) }

    private func headers(json: Bool) -> [String: String] {
        var h = ["Accept": "application/json", "User-Agent": "monemee-swift/\(Monemee.sdkVersion)"]
        if json { h["Content-Type"] = "application/json" }
        return h
    }

    private func send(_ request: MonemeeHTTPRequest) async throws -> MonemeeHTTPResponse {
        do {
            return try await transport.send(request)
        } catch let error as LicenseError {
            throw error
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw LicenseError(code: .network, message: "Monemee is not reachable (\(error.localizedDescription))")
        }
    }

    private func post(_ path: String, _ body: LicenseRequestBody) async throws -> LicenseResponseData {
        guard let url = URL(string: "\(apiBase)/api/v1/licenses/\(path)") else {
            throw LicenseError(code: .config, message: "baseURL is not a valid URL")
        }
        let response = try await send(MonemeeHTTPRequest(method: "POST", url: url, headers: headers(json: true),
                                                         body: try JSONEncoder().encode(body)))
        let envelope = try? JSONDecoder().decode(ResponseEnvelope.self, from: response.body)
        guard (200..<300).contains(response.status), let data = envelope?.data else {
            throw LicenseError(code: response.status == 429 ? .rateLimited : .server,
                               message: envelope?.message ?? "HTTP \(response.status)", status: response.status)
        }
        return data
    }

    private func addKeys(_ list: [JWKEntry]) {
        for entry in list {
            guard let kid = entry.kid, let x = entry.x, !kid.isEmpty, !x.isEmpty,
                  !keys.contains(where: { $0.kid == kid }) else { continue }
            keys.append(LicensePublicKey(kid: kid, x: x))
        }
    }

    /// Fetches public keys only for a key ID that is not known yet (key rotation).
    private func ensureKeys(_ kid: String) async throws {
        if keys.contains(where: { $0.kid == kid }) { return }
        if let cached = try? await storage.value(forKey: "keys"),
           let list = try? JSONDecoder().decode([JWKEntry].self, from: Data(cached.utf8)) {
            addKeys(list)
            if keys.contains(where: { $0.kid == kid }) { return }
        }
        guard let url = URL(string: "\(apiBase)/.well-known/monemee-license-keys.json") else { return }
        let response = try await send(MonemeeHTTPRequest(method: "GET", url: url, headers: headers(json: false)))
        guard (200..<300).contains(response.status) else {
            throw LicenseError(code: .server, message: "HTTP \(response.status)", status: response.status)
        }
        let fetched = (try? JSONDecoder().decode(JWKSet.self, from: response.body))?.keys ?? []
        addKeys(fetched)
        if !fetched.isEmpty, let json = try? JSONEncoder().encode(fetched) {
            try? await storage.setValue(String(decoding: json, as: UTF8.self), forKey: "keys")
        }
    }

    // MARK: - Trust

    /// Checks a signed response against keys, product, key hash, device and time.
    private func trusted(_ signed: SignedLicense, key: String, device: String, maxAge: TimeInterval) async -> LicensePayload? {
        try? await ensureKeys(signed.kid) // offline: only bundled and remembered keys
        guard var payload = LicenseSignature.verify(signed, publicKeys: keys) else { return nil }
        guard payload.productId == productId, payload.keySHA256 == Hashing.sha256Hex(key) else { return nil }
        if let bound = payload.deviceId, !bound.isEmpty, bound != device { return nil }
        let current = now()
        guard let issued = Timestamp.parse(payload.issuedAt),
              issued.timeIntervalSince(current) <= License.clockSkew,
              current.timeIntervalSince(issued) <= maxAge else { return nil }
        if let expires = Timestamp.parse(payload.expiresAt), expires < current {
            payload.valid = false
            payload.reason = .expired
        }
        return payload
    }

    // MARK: - Results

    private func result(from data: LicenseResponseData) -> LicenseResult {
        LicenseResult(valid: data.valid ?? false, reason: data.reason, plan: data.plan,
                      expiresAt: Timestamp.parse(data.expiresAt), test: data.test ?? false,
                      activations: data.activations)
    }

    private func result(from payload: LicensePayload, offline: Bool) -> LicenseResult {
        LicenseResult(valid: payload.valid, reason: payload.reason, plan: payload.plan,
                      expiresAt: Timestamp.parse(payload.expiresAt), test: payload.test, offline: offline)
    }
}

// MARK: - Wire types

struct StoredState: Codable {
    var v: Int = License.storeVersion
    var key: String
    var signed: SignedLicense?
    /// Milliseconds since 1970, like `monemee-client`.
    var checkedAt: Double

    init(key: String, signed: SignedLicense?, checkedAt: Double) {
        self.key = key
        self.signed = signed
        self.checkedAt = checkedAt
    }
}

struct LicenseRequestBody: Encodable {
    let key: String
    let productId: Int
    let deviceId: String
    var deviceName: String?

    enum CodingKeys: String, CodingKey {
        case key
        case productId = "product_id"
        case deviceId = "device_id"
        case deviceName = "device_name"
    }
}

struct ResponseEnvelope: Decodable {
    let data: LicenseResponseData?
    let message: String?
}

struct LicenseResponseData: Decodable {
    var valid: Bool?
    var reason: LicenseReason?
    var plan: String?
    var expiresAt: String?
    var test: Bool?
    var activations: LicenseActivations?
    var signed: SignedLicense?
    var deactivated: Bool?
    /// `signed` is present but not a readable signature object.
    var signedMalformed = false

    enum CodingKeys: String, CodingKey {
        case valid, reason, plan, test, activations, signed, deactivated
        case expiresAt = "expires_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        valid = try? c.decodeIfPresent(Bool.self, forKey: .valid)
        reason = try? c.decodeIfPresent(LicenseReason.self, forKey: .reason)
        plan = try? c.decodeIfPresent(String.self, forKey: .plan)
        expiresAt = try? c.decodeIfPresent(String.self, forKey: .expiresAt)
        test = try? c.decodeIfPresent(Bool.self, forKey: .test)
        activations = try? c.decodeIfPresent(LicenseActivations.self, forKey: .activations)
        if c.contains(.signed), !((try? c.decodeNil(forKey: .signed)) ?? false) {
            signed = try? c.decode(SignedLicense.self, forKey: .signed)
            signedMalformed = signed == nil
        }
        deactivated = try? c.decodeIfPresent(Bool.self, forKey: .deactivated)
    }
}

struct JWKEntry: Codable {
    var kid: String?
    var kty: String?
    var crv: String?
    var x: String?
}

struct JWKSet: Decodable {
    var keys: [JWKEntry]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        keys = (try? c.decodeIfPresent([JWKEntry].self, forKey: .keys)) ?? []
    }

    enum CodingKeys: String, CodingKey { case keys }
}
