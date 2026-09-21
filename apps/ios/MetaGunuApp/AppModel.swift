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
    @Published var isStartingVoice = false
    @Published var liveTranscript = ""
    @Published var gatewayWebSocketURL = "ws://localhost:8787/v1/live/connect"
    @Published var gatewayToken = "local-development-only"

    private var machine = CompanionStateMachine()
    private let routes = AudioRouteMonitor()
    private let phoneVoice = PhoneVoiceSession()
    private var voiceStartTask: Task<Void, Never>?

    init() {
        routes.onChange = { [weak self] route in
            guard let self else { return }
            Task { @MainActor in
                let permission = self.machine.routeChanged(to: route)
                self.companion = self.machine.state
                if case .denied = permission, self.phoneVoice.isActive {
                    self.phoneVoice.stop()
                    self.routes.deactivate()
                }
            }
        }
        phoneVoice.onTranscript = { [weak self] delta in self?.liveTranscript += delta }
        phoneVoice.onFailure = { [weak self] reason in
            guard let self else { return }
            self.machine.interrupt(reason: reason)
            self.companion = self.machine.state
            self.routes.deactivate()
        }
        phoneVoice.onEndSessionRequested = { [weak self] in self?.endSession() }
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
        guard !isStartingVoice else { return }
        isStartingVoice = true
        liveTranscript = ""
        voiceStartTask = Task { @MainActor in
            defer {
                isStartingVoice = false
                voiceStartTask = nil
            }
            do {
                guard await routes.requestPhoneMicrophonePermission() else {
                    throw AudioRouteMonitor.RouteError.phonePermissionDenied
                }
                try Task.checkCancellation()
                let route = try routes.prepareExplicitPhoneInput()
                guard let url = URL(string: gatewayWebSocketURL),
                      ["ws", "wss"].contains(url.scheme?.lowercased() ?? "") else {
                    throw AudioRouteMonitor.RouteError.invalidGatewayURL
                }
                try await phoneVoice.start(
                    configuration: GatewayVoiceConfiguration(webSocketURL: url, bearerToken: gatewayToken),
                    conversationID: UUID(),
                    expectedRoute: route
                )
                try Task.checkCancellation()
                _ = machine.talkOnPhone(currentRoute: routes.currentInput())
            } catch is CancellationError {
                phoneVoice.stop()
                routes.deactivate()
                return
            } catch {
                phoneVoice.stop()
                routes.deactivate()
                machine.interrupt(reason: error.localizedDescription)
            }
            companion = machine.state
        }
    }

    func endSession() {
        voiceStartTask?.cancel()
        phoneVoice.stop()
        _ = machine.endSession()
        companion = machine.state
        if companion.mode == .stopped { routes.deactivate() }
    }

    func stopListening() {
        voiceStartTask?.cancel()
        phoneVoice.stop()
        machine.stopListening()
        routes.deactivate()
        companion = machine.state
    }

    func appActivityChanged(isActive: Bool) {
        guard !isActive, companion.mode == .phone || isStartingVoice else { return }
        voiceStartTask?.cancel()
        phoneVoice.stop()
        routes.deactivate()
        machine.interrupt(reason: "Phone voice paused because the app is no longer active.")
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
        var options: AVAudioSession.CategoryOptions = [.defaultToSpeaker]
#if compiler(>=6.2)
        options.insert(.allowBluetoothHFP)
#else
        options.insert(.allowBluetooth)
#endif
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: options)
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

    func requestPhoneMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    enum RouteError: LocalizedError {
        case phoneInputUnavailable
        case phonePermissionDenied
        case invalidGatewayURL

        var errorDescription: String? {
            switch self {
            case .phoneInputUnavailable: "The iPhone microphone is unavailable."
            case .phonePermissionDenied: "Microphone permission was not granted."
            case .invalidGatewayURL: "Enter a valid ws:// or wss:// voice gateway address in Settings."
            }
        }
    }
}
