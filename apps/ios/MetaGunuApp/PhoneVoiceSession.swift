@preconcurrency import AVFoundation
import Foundation
import MetaGunuCore

struct GatewayVoiceConfiguration: Sendable {
    let webSocketURL: URL
    let bearerToken: String
}

@MainActor
final class PhoneVoiceSession {
    var onTranscript: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    var onEndSessionRequested: (() -> Void)?

    private let audio = PhoneAudioIO()
    private var socket: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var closingTask: Task<Void, Never>?
    private var ready = false
    private var isClosing = false
    private var lastFailure: String?
    private var endSessionDetector = EndSessionCommandDetector()
    private(set) var isActive = false

    func start(
        configuration: GatewayVoiceConfiguration,
        conversationID: UUID,
        expectedRoute: AudioRoute
    ) async throws {
        guard expectedRoute.kind == .builtInPhone else { throw VoiceError.invalidPhoneRoute }
        guard socket == nil else { throw VoiceError.alreadyActive }
        lastFailure = nil

        var request = URLRequest(url: configuration.webSocketURL)
        request.setValue("Bearer \(configuration.bearerToken)", forHTTPHeaderField: "Authorization")
        let task = URLSession.shared.webSocketTask(with: request)
        socket = task
        task.resume()
        receiveTask = Task { [weak self] in await self?.receiveLoop(task) }

        do {
            try await send([
                "type": "meta_gunu.start",
                "conversationId": conversationID.uuidString,
                "audioSource": ["kind": "phone", "explicitConsent": true],
            ])
            try await waitUntilReady()
            try audio.start(
                expectedRouteID: expectedRoute.id,
                onAudio: { [weak self] data in
                    Task { @MainActor [weak self] in
                        try? await self?.sendAudio(data)
                    }
                },
                onRouteViolation: { [weak self] in
                    Task { @MainActor [weak self] in
                        self?.fail("Phone audio route changed. Capture stopped.")
                    }
                }
            )
            isActive = true
        } catch {
            abort()
            throw error
        }
    }

    func stop() {
        audio.stop()
        isActive = false
        let wasReady = ready
        ready = false
        endSessionDetector = EndSessionCommandDetector()
        guard let socket else { return }
        guard wasReady else {
            finishTransport(socket)
            return
        }
        guard !isClosing else { return }
        isClosing = true
        closingTask = Task { [weak self] in
            try? await socket.send(.string("{\"type\":\"session.close\"}"))
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            self?.finishTransport(socket)
        }
    }

    private func waitUntilReady() async throws {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .seconds(10))
        while !ready {
            guard socket != nil else {
                throw VoiceError.provider(lastFailure ?? VoiceError.notConnected.localizedDescription)
            }
            if clock.now >= deadline { throw VoiceError.connectionTimedOut }
            try await Task.sleep(for: .milliseconds(50))
        }
    }

    private func sendAudio(_ data: Data) async throws {
        guard isActive || ready else { return }
        try await send(["type": "session.input_audio.append", "audio": data.base64EncodedString()])
    }

    private func send(_ value: [String: Any]) async throws {
        guard let socket else { throw VoiceError.notConnected }
        let data = try JSONSerialization.data(withJSONObject: value)
        guard let text = String(data: data, encoding: .utf8) else { throw VoiceError.invalidMessage }
        try await socket.send(.string(text))
    }

    private func receiveLoop(_ task: URLSessionWebSocketTask) async {
        do {
            while !Task.isCancelled {
                let message = try await task.receive()
                let data: Data
                switch message {
                case .string(let text): data = Data(text.utf8)
                case .data(let binary): data = binary
                @unknown default: continue
                }
                try handleServerEvent(data)
            }
        } catch is CancellationError {
            return
        } catch {
            if socket === task {
                if isClosing {
                    finishTransport(task)
                } else {
                    fail("Voice connection ended: \(error.localizedDescription)")
                }
            }
        }
    }

    private func handleServerEvent(_ data: Data) throws {
        guard let event = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = event["type"] as? String else { throw VoiceError.invalidMessage }
        switch type {
        case "meta_gunu.ready", "session.started":
            ready = true
        case "meta_gunu.error":
            throw VoiceError.provider((event["message"] as? String) ?? "Live session failed")
        case "session.output_audio.delta":
            if let encoded = event["delta"] as? String, let chunk = Data(base64Encoded: encoded) {
                audio.play(chunk)
            }
        case "session.input_transcript.delta":
            if let delta = event["delta"] as? String {
                onTranscript?(delta)
                if endSessionDetector.consume(
                    delta: delta,
                    startMilliseconds: event["start_ms"] as? Double,
                    endMilliseconds: event["end_ms"] as? Double
                ) {
                    onEndSessionRequested?()
                }
            }
        case "session.output_transcript.delta":
            if let delta = event["delta"] as? String { onTranscript?(delta) }
        case "error":
            let providerError = event["error"] as? [String: Any]
            throw VoiceError.provider((providerError?["message"] as? String) ?? "Live provider error")
        case "session.closed":
            audio.stop()
            isActive = false
            if let socket { finishTransport(socket) }
        default:
            break
        }
    }

    private func fail(_ message: String) {
        lastFailure = message
        abort()
        onFailure?(message)
    }

    private func abort() {
        audio.stop()
        isActive = false
        if let socket {
            finishTransport(socket)
        } else {
            ready = false
            isClosing = false
            endSessionDetector = EndSessionCommandDetector()
        }
    }

    private func finishTransport(_ task: URLSessionWebSocketTask) {
        task.cancel(with: .normalClosure, reason: nil)
        guard socket === task else { return }
        receiveTask?.cancel()
        closingTask?.cancel()
        receiveTask = nil
        closingTask = nil
        socket = nil
        ready = false
        isClosing = false
        endSessionDetector = EndSessionCommandDetector()
    }

    enum VoiceError: LocalizedError {
        case alreadyActive
        case connectionTimedOut
        case invalidMessage
        case invalidPhoneRoute
        case notConnected
        case provider(String)

        var errorDescription: String? {
            switch self {
            case .alreadyActive: "A voice session is already active."
            case .connectionTimedOut: "The voice gateway did not become ready in time."
            case .invalidMessage: "The voice gateway sent an invalid message."
            case .invalidPhoneRoute: "The selected input is not the iPhone microphone."
            case .notConnected: "The voice gateway is not connected."
            case .provider(let message): message
            }
        }
    }
}

@MainActor
private final class PhoneAudioIO {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var outputFormat: AVAudioFormat?
    private var playerAttached = false
    private var tapInstalled = false

    func start(
        expectedRouteID: String,
        onAudio: @escaping @Sendable (Data) -> Void,
        onRouteViolation: @escaping @Sendable () -> Void
    ) throws {
        guard !engine.isRunning else { return }
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard let pcmFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 24_000,
            channels: 1,
            interleaved: false
        ), let converter = AVAudioConverter(from: inputFormat, to: pcmFormat) else {
            throw PhoneAudioError.unsupportedFormat
        }
        outputFormat = pcmFormat
        if !playerAttached {
            engine.attach(player)
            playerAttached = true
        }
        engine.connect(player, to: engine.mainMixerNode, format: pcmFormat)

        input.installTap(onBus: 0, bufferSize: 2_048, format: inputFormat) { buffer, _ in
            guard AVAudioSession.sharedInstance().currentRoute.inputs.first?.uid == expectedRouteID else {
                onRouteViolation()
                return
            }
            let ratio = pcmFormat.sampleRate / inputFormat.sampleRate
            let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up))
            guard let converted = AVAudioPCMBuffer(pcmFormat: pcmFormat, frameCapacity: capacity) else { return }
            let inputBox = ConverterInputBox(buffer: buffer)
            var conversionError: NSError?
            let status = converter.convert(to: converted, error: &conversionError) { _, inputStatus in
                inputBox.next(status: inputStatus)
            }
            guard status != .error,
                  converted.frameLength > 0,
                  let samples = converted.int16ChannelData?[0] else { return }
            onAudio(Data(bytes: samples, count: Int(converted.frameLength) * MemoryLayout<Int16>.size))
        }
        tapInstalled = true
        engine.prepare()
        try engine.start()
    }

    func play(_ data: Data) {
        guard engine.isRunning, let outputFormat else { return }
        let frames = AVAudioFrameCount(data.count / MemoryLayout<Int16>.size)
        guard frames > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: frames),
              let samples = buffer.int16ChannelData?[0] else { return }
        buffer.frameLength = frames
        data.withUnsafeBytes { bytes in
            if let base = bytes.baseAddress { memcpy(samples, base, data.count) }
        }
        player.scheduleBuffer(buffer)
        if !player.isPlaying { player.play() }
    }

    func stop() {
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        player.stop()
        engine.stop()
        engine.reset()
        outputFormat = nil
    }

    enum PhoneAudioError: LocalizedError {
        case unsupportedFormat
        var errorDescription: String? { "The iPhone audio format could not be converted safely." }
    }
}

private final class ConverterInputBox: @unchecked Sendable {
    private let buffer: AVAudioPCMBuffer
    private let lock = NSLock()
    private var supplied = false

    init(buffer: AVAudioPCMBuffer) {
        self.buffer = buffer
    }

    func next(status: UnsafeMutablePointer<AVAudioConverterInputStatus>) -> AVAudioBuffer? {
        lock.lock()
        defer { lock.unlock() }
        guard !supplied else {
            status.pointee = .noDataNow
            return nil
        }
        supplied = true
        status.pointee = .haveData
        return buffer
    }
}
