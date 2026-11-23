import Monemee
import SwiftUI

/// Your Monemee product ID (dashboard > Products). Test keys: dashboard > License keys > Test key.
let productId = 123

@MainActor
final class LicenseModel: ObservableObject {
    @Published private(set) var result: LicenseResult?
    @Published private(set) var busy = false
    @Published var message: String?

    private let license: License

    init() {
        license = try! License(productId: productId, deviceName: Host.current().localizedName)
    }

    var unlocked: Bool { result?.valid == true }

    /// On every start. Works offline for 7 days after the last successful check.
    func check() async {
        busy = true
        defer { busy = false }
        do {
            result = try await license.check()
        } catch {
            message = error.localizedDescription
        }
    }

    func activate(_ key: String) async {
        busy = true
        defer { busy = false }
        do {
            let r = try await license.activate(key)
            result = r
            message = r.valid ? nil : Self.text(for: r.reason)
        } catch {
            message = error.localizedDescription
        }
    }

    func deactivate() async {
        _ = try? await license.deactivate()
        result = nil
    }

    func buy() {
        _ = try? Monemee.openBuyPage(productId: productId)
    }

    static func text(for reason: LicenseReason?) -> String {
        switch reason {
        case .activationLimit?: return "This key is already used on the maximum number of Macs. Deactivate it on another Mac first."
        case .revoked?: return "This key was revoked."
        case .expired?: return "This license has expired."
        case .notFound?: return "This key does not exist."
        default: return "The key is not valid (\(reason?.rawValue ?? "unknown"))."
        }
    }
}

@main
struct LicenseDemoApp: App {
    @StateObject private var model = LicenseModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if model.unlocked {
                    ProView(model: model)
                } else {
                    PaywallView(model: model)
                }
            }
            .frame(minWidth: 420, minHeight: 280)
            .task { await model.check() }
        }
    }
}

struct PaywallView: View {
    @ObservedObject var model: LicenseModel
    @State private var key = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Unlock Pro").font(.title2.bold())
            Text("Enter the license key from your purchase email.")
                .foregroundStyle(.secondary)
            TextField("MM-XXXX-XXXX-XXXX-XXXX", text: $key)
                .textFieldStyle(.roundedBorder)
                .font(.body.monospaced())
                .onSubmit { Task { await model.activate(key) } }
            if let message = model.message {
                Text(message).foregroundStyle(.red)
            }
            HStack {
                Button("Activate") { Task { await model.activate(key) } }
                    .keyboardShortcut(.defaultAction)
                    .disabled(key.isEmpty || model.busy)
                Button("Buy a license") { model.buy() }
            }
        }
        .padding(24)
    }
}

struct ProView: View {
    @ObservedObject var model: LicenseModel

    var body: some View {
        VStack(spacing: 12) {
            Text("Pro is unlocked").font(.title2.bold())
            if let plan = model.result?.plan { Text("Plan: \(plan)") }
            if model.result?.offline == true {
                Text("Offline: using the last verified license.").foregroundStyle(.secondary)
            }
            Button("Deactivate this Mac") { Task { await model.deactivate() } }
        }
        .padding(24)
    }
}
