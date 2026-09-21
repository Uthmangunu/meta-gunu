import Foundation

public protocol AudioRouteProviding: Sendable {
    func currentInput() async -> AudioRoute?
}

public protocol AudioCapturing: Sendable {
    func start() async throws
    func stop() async
}

public protocol WakeDetecting: Sendable {
    func start(phrase: String) async throws
    func stop() async
}

public protocol VoiceSessionServing: Sendable {
    func connect(conversationID: UUID, source: AudioRoute) async throws
    func close() async
}

public protocol CameraBackend: Sendable {
    associatedtype Image: Sendable
    func start() async throws
    func capture() async throws -> Image
    func stop() async
}

public struct OneShotCamera<Backend: CameraBackend>: Sendable {
    private let backend: Backend

    public init(backend: Backend) {
        self.backend = backend
    }

    public func captureRequestedImage() async throws -> Backend.Image {
        try await backend.start()
        do {
            let image = try await backend.capture()
            await backend.stop()
            return image
        } catch {
            await backend.stop()
            throw error
        }
    }
}

public protocol MemoryServing: Sendable {
    func list() async throws -> [MemoryItem]
    func remember(_ fact: String) async throws -> MemoryItem
    func forget(id: UUID) async throws
}

public protocol TaskServing: Sendable {
    func submit(_ request: TaskRequest) async throws -> TaskItem
    func cancel(id: UUID) async throws
}

public struct MemoryItem: Identifiable, Sendable, Equatable {
    public let id: UUID
    public var fact: String
    public let source: String?
    public let updatedAt: Date

    public init(id: UUID, fact: String, source: String? = nil, updatedAt: Date) {
        self.id = id
        self.fact = fact
        self.source = source
        self.updatedAt = updatedAt
    }
}

public struct TaskRequest: Sendable, Equatable {
    public let id: UUID
    public let idempotencyKey: String
    public let prompt: String
    public let requiresLaptop: Bool

    public init(id: UUID, idempotencyKey: String, prompt: String, requiresLaptop: Bool) {
        self.id = id
        self.idempotencyKey = idempotencyKey
        self.prompt = prompt
        self.requiresLaptop = requiresLaptop
    }
}

public struct TaskItem: Identifiable, Sendable, Equatable {
    public let id: UUID
    public let title: String
    public let status: String

    public init(id: UUID, title: String, status: String) {
        self.id = id
        self.title = title
        self.status = status
    }
}
