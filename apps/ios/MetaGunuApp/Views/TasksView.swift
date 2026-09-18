import SwiftUI

struct TasksView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            Section {
                LabeledContent("Cloud research", value: "Available when configured")
                LabeledContent("Laptop agent", value: model.laptopConnected ? "Connected" : "Offline")
            } footer: {
                Text("Research can continue without the laptop. Laptop-only requests report unavailable instead of pretending to run.")
            }
            Section("Recent work") {
                if model.tasks.isEmpty {
                    ContentUnavailableView("No tasks yet", systemImage: "sparkles.rectangle.stack")
                } else {
                    ForEach(model.tasks) { task in
                        LabeledContent(task.title, value: task.status)
                    }
                }
            }
        }
        .navigationTitle("Work")
    }
}
