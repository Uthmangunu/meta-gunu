import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            NavigationStack { ConversationView() }
                .tabItem { Label("Musa", systemImage: "waveform") }
            NavigationStack { TasksView() }
                .tabItem { Label("Work", systemImage: "sparkles.rectangle.stack") }
            NavigationStack { MemoryView() }
                .tabItem { Label("Memory", systemImage: "brain.head.profile") }
            NavigationStack { SettingsView() }
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(.indigo)
    }
}
