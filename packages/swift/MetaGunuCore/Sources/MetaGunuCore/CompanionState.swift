import Foundation

public enum ListeningMode: String, Sendable, Equatable {
    case stopped
    case glasses
    case phone
}

public enum CompanionPhase: Sendable, Equatable {
    case stopped
    case waitingForWakePhrase
    case conversing
    case interrupted(reason: String)
}

public enum AudioRouteKind: String, Sendable, Equatable {
    case builtInPhone
    case bluetooth
    case unknown
}

public struct AudioRoute: Sendable, Equatable {
    public let id: String
    public let name: String
    public let kind: AudioRouteKind

    public init(id: String, name: String, kind: AudioRouteKind) {
        self.id = id
        self.name = name
        self.kind = kind
    }
}

public struct CompanionState: Sendable, Equatable {
    public var mode: ListeningMode
    public var phase: CompanionPhase
    public var selectedGlassesRouteID: String?
    public var activeRoute: AudioRoute?
    public var cloudSessionOpen: Bool

    public init(
        mode: ListeningMode = .stopped,
        phase: CompanionPhase = .stopped,
        selectedGlassesRouteID: String? = nil,
        activeRoute: AudioRoute? = nil,
        cloudSessionOpen: Bool = false
    ) {
        self.mode = mode
        self.phase = phase
        self.selectedGlassesRouteID = selectedGlassesRouteID
        self.activeRoute = activeRoute
        self.cloudSessionOpen = cloudSessionOpen
    }
}

public enum CapturePermission: Sendable, Equatable {
    case denied(reason: String)
    case localWakeOnly
    case cloudConversation
}

public struct CompanionStateMachine: Sendable {
    public private(set) var state: CompanionState

    public init(state: CompanionState = .init()) {
        self.state = state
    }

    @discardableResult
    public mutating func startGlassesMode(selectedRouteID: String, currentRoute: AudioRoute?) -> CapturePermission {
        guard let currentRoute, currentRoute.kind == .bluetooth, currentRoute.id == selectedRouteID else {
            state = CompanionState(
                mode: .glasses,
                phase: .interrupted(reason: "Selected glasses microphone is unavailable"),
                selectedGlassesRouteID: selectedRouteID,
                activeRoute: currentRoute
            )
            return .denied(reason: "Selected glasses microphone is unavailable")
        }
        state = CompanionState(
            mode: .glasses,
            phase: .waitingForWakePhrase,
            selectedGlassesRouteID: selectedRouteID,
            activeRoute: currentRoute
        )
        return .localWakeOnly
    }

    @discardableResult
    public mutating func talkOnPhone(currentRoute: AudioRoute?) -> CapturePermission {
        guard let currentRoute, currentRoute.kind == .builtInPhone else {
            state = CompanionState(
                mode: .phone,
                phase: .interrupted(reason: "The built-in microphone is not the active input"),
                activeRoute: currentRoute
            )
            return .denied(reason: "The built-in microphone is not the active input")
        }
        state = CompanionState(mode: .phone, phase: .conversing, activeRoute: currentRoute, cloudSessionOpen: true)
        return .cloudConversation
    }

    @discardableResult
    public mutating func wakePhraseDetected() -> CapturePermission {
        guard state.mode == .glasses, state.phase == .waitingForWakePhrase else {
            return .denied(reason: "Wake phrase is not active")
        }
        state.phase = .conversing
        state.cloudSessionOpen = true
        return .cloudConversation
    }

    @discardableResult
    public mutating func routeChanged(to route: AudioRoute?) -> CapturePermission {
        state.activeRoute = route
        switch state.mode {
        case .stopped:
            return .denied(reason: "Listening is stopped")
        case .glasses:
            guard let route,
                  route.kind == .bluetooth,
                  route.id == state.selectedGlassesRouteID else {
                state.phase = .interrupted(reason: "Glasses audio disconnected or changed")
                state.cloudSessionOpen = false
                return .denied(reason: "Glasses audio disconnected or changed")
            }
            return state.phase == .conversing ? .cloudConversation : .localWakeOnly
        case .phone:
            guard route?.kind == .builtInPhone else {
                state.phase = .interrupted(reason: "Phone audio route changed")
                state.cloudSessionOpen = false
                return .denied(reason: "Phone audio route changed")
            }
            return state.phase == .conversing ? .cloudConversation : .denied(reason: "Phone session is not active")
        }
    }

    @discardableResult
    public mutating func endSession() -> CapturePermission {
        state.cloudSessionOpen = false
        if state.mode == .glasses,
           let route = state.activeRoute,
           route.kind == .bluetooth,
           route.id == state.selectedGlassesRouteID {
            state.phase = .waitingForWakePhrase
            return .localWakeOnly
        }
        state.mode = .stopped
        state.phase = .stopped
        state.activeRoute = nil
        return .denied(reason: "Session ended")
    }

    public mutating func interrupt(reason: String) {
        state.phase = .interrupted(reason: reason)
        state.cloudSessionOpen = false
    }

    public mutating func stopListening() {
        state = CompanionState()
    }
}
