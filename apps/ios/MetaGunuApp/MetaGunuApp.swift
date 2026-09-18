import SwiftUI

@main
struct MetaGunuApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .onChange(of: scenePhase) { _, newPhase in
                    model.appActivityChanged(isActive: newPhase == .active)
                }
        }
    }
}
