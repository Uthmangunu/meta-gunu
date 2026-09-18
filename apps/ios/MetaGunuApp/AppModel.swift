import AVFoundation
import Foundation
import MetaGunuCore

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var companion = CompanionState()
    @Published var assistantName = "Musa"
    @Published var wakePhrase = "Kai Musa"
    @Published var selectedGlassesRouteID = ""
    @Published var laptopConnected = false
    @Published var budgetSpent = 0.0
    @Published var budgetLimit = 25.0
    @Published var memories: [MemoryItem] = []
    @Published var tasks: [TaskItem] = []

    private var machine = CompanionStateMachine()
    private let routes = AudioRouteMonitor()

    init() {
        routes.onChange = { [weak self] route in
            guard let self else { return }
            Task { @MainActor in
                _ = self.machine.routeChanged(to: route)
                self.companion = self.machine.state
            }
        }
    }

    var stateTitle: String {
        switch companion.phase {
        case .stopped: "Stopped"
        case .waitingForWakePhrase: "Waiting for \(wakePhrase)"
        case .conversing: "Conversing"
        case .interrupted: "Interrupted"
        }
    }

    var stateDetail: String {
        switch companion.phase {
        case .stopped:
            "No microphone is active."
        case .waitingForWakePhrase:
            "Listening locally through \(companion.activeRoute?.name ?? "selected glasses")."
        case .conversing:
            "Audio source: \(companion.activeRoute?.name ?? "unknown")."
        case .interrupted(let reason):
            reason
        }
    }

    func startGlassesListening() {
        guard !selectedGlassesRouteID.isEmpty else {
            machine.interrupt(reason: "Select and verify your glasses audio route first.")
            companion = machine.state
            return
        }
        _ = machine.startGlassesMode(selectedRouteID: selectedGlassesRouteID, currentRoute: routes.currentInput())
        companion = machine.state
    }

    func simulateVerifiedWakeForDevelopment() {
        _ = machine.wakePhraseDetected()
        companion = machine.state
    }

    func talkOnPhone() {
        do {
            let route = try routes.prepareExplicitPhoneInput()
            _ = machine.talkOnPhone(currentRoute: route)
        } catch {
            machine.interrupt(reason: error.localizedDescription)
        }
        companion = machine.state
    }

    func endSession() {
        _ = machine.endSession()
        companion = machine.state
        if companion.mode == .stopped { routes.deactivate() }
    }

    func stopListening() {
        machine.stopListening()
        routes.deactivate()
        companion = machine.state
    }
}

@MainActor
final class AudioRouteMonitor {
    var onChange: ((AudioRoute?) -> Void)?
    private let session = AVAudioSession.sharedInstance()
    nonisolated(unsafe) private var observer: NSObjectProtocol?

    init() {
        observer = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: session,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.onChange?(self.currentInput()) }
        }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    func currentInput() -> AudioRoute? {
        guard let port = session.currentRoute.inputs.first else { return nil }
        return AudioRoute(
            id: port.uid,
            name: port.portName,
            kind: port.portType == .builtInMic ? .builtInPhone : (port.portType == .bluetoothHFP ? .bluetooth : .unknown)
        )
    }

    func prepareExplicitPhoneInput() throws -> AudioRoute {
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
        try session.setActive(true)
        guard let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) else {
            throw RouteError.phoneInputUnavailable
        }
        try session.setPreferredInput(builtIn)
        return AudioRoute(id: builtIn.uid, name: builtIn.portName, kind: .builtInPhone)
    }

    func deactivate() {
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    enum RouteError: LocalizedError {
        case phoneInputUnavailable
        var errorDescription: String? { "The iPhone microphone is unavailable." }
    }
}
