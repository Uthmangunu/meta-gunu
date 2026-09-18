import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Form {
            Section("Assistant") {
                TextField("Assistant name", text: $model.assistantName)
                TextField("Wake phrase", text: $model.wakePhrase)
            }
            Section {
                TextField("Verified route ID", text: $model.selectedGlassesRouteID)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Glasses audio")
            } footer: {
                Text("A route must be verified on the physical glasses. Names alone are not treated as proof, and Meta Gunu never falls back to the phone microphone.")
            }
            Section("Storage") {
                Button("Review memory") {}
                Button("Clear conversation history", role: .destructive) {}
                Button("Clear all memory", role: .destructive) {}
            }
            Section("Status") {
                LabeledContent("Wearable integration", value: "Not verified")
                LabeledContent("Wake engine", value: "Not selected")
                LabeledContent("Camera", value: "Off")
            }
        }
        .navigationTitle("Settings")
    }
}
