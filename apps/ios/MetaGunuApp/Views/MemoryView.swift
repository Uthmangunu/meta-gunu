import SwiftUI

struct MemoryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var privateConversation = false

    var body: some View {
        List {
            Section {
                Toggle("Private conversation", isOn: $privateConversation)
            } footer: {
                Text("Private conversations do not create durable personal memories.")
            }

            Section("Saved memories") {
                if model.memories.isEmpty {
                    ContentUnavailableView("No saved memories", systemImage: "brain", description: Text("Say “remember this” during a connected conversation."))
                } else {
                    ForEach(model.memories) { memory in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(memory.fact)
                            Text(memory.updatedAt, style: .date).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Memory")
    }
}
