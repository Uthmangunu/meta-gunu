import Testing
@testable import MetaGunuCore

private let glasses = AudioRoute(id: "ray-ban-1", name: "Ray-Ban Meta", kind: .bluetooth)
private let phone = AudioRoute(id: "iphone", name: "iPhone Microphone", kind: .builtInPhone)

@Test func openingStateCapturesNothing() {
    let machine = CompanionStateMachine()
    #expect(machine.state.mode == .stopped)
    #expect(machine.state.phase == .stopped)
    #expect(machine.state.cloudSessionOpen == false)
}

@Test func glassesModeRejectsPhoneRoute() {
    var machine = CompanionStateMachine()
    let permission = machine.startGlassesMode(selectedRouteID: glasses.id, currentRoute: phone)
    #expect(permission == .denied(reason: "Selected glasses microphone is unavailable"))
    #expect(machine.state.phase == .interrupted(reason: "Selected glasses microphone is unavailable"))
}

@Test func glassesWakeOpensConversationAndEndReturnsToWake() {
    var machine = CompanionStateMachine()
    #expect(machine.startGlassesMode(selectedRouteID: glasses.id, currentRoute: glasses) == .localWakeOnly)
    #expect(machine.wakePhraseDetected() == .cloudConversation)
    #expect(machine.state.phase == .conversing)
    #expect(machine.endSession() == .localWakeOnly)
    #expect(machine.state.phase == .waitingForWakePhrase)
}

@Test func routeFallbackSuspendsInsteadOfUsingPhone() {
    var machine = CompanionStateMachine()
    _ = machine.startGlassesMode(selectedRouteID: glasses.id, currentRoute: glasses)
    _ = machine.wakePhraseDetected()
    let permission = machine.routeChanged(to: phone)
    #expect(permission == .denied(reason: "Glasses audio disconnected or changed"))
    #expect(machine.state.cloudSessionOpen == false)
}

@Test func phoneModeRequiresExplicitPhoneAction() {
    var machine = CompanionStateMachine()
    #expect(machine.routeChanged(to: phone) == .denied(reason: "Listening is stopped"))
    #expect(machine.talkOnPhone(currentRoute: phone) == .cloudConversation)
    #expect(machine.state.mode == .phone)
}

@Test func phoneRouteChangeInterruptsCloudSession() {
    var machine = CompanionStateMachine()
    _ = machine.talkOnPhone(currentRoute: phone)
    let permission = machine.routeChanged(to: glasses)
    #expect(permission == .denied(reason: "Phone audio route changed"))
    #expect(machine.state.phase == .interrupted(reason: "Phone audio route changed"))
    #expect(machine.state.cloudSessionOpen == false)
}

@Test func stopReleasesAllState() {
    var machine = CompanionStateMachine()
    _ = machine.talkOnPhone(currentRoute: phone)
    machine.stopListening()
    #expect(machine.state == CompanionState())
}

@Test func exactSpokenEndSessionCommandIsDetected() {
    var detector = EndSessionCommandDetector()
    #expect(detector.consume(delta: "End", startMilliseconds: 1_000, endMilliseconds: 1_300) == false)
    #expect(detector.consume(delta: " session.", startMilliseconds: 1_300, endMilliseconds: 1_700) == true)
}

@Test func incidentalEndSessionWordsAreNotACommand() {
    var detector = EndSessionCommandDetector()
    #expect(detector.consume(delta: "Please explain end session", startMilliseconds: 1_000, endMilliseconds: 2_200) == false)
    #expect(detector.consume(delta: "End session", startMilliseconds: 3_100, endMilliseconds: 3_700) == true)
}
