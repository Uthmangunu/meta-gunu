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
            Section {
                TextField("ws://gateway:8787/v1/live/connect", text: $model.gatewayWebSocketURL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                SecureField("Development bearer token", text: $model.gatewayToken)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Voice gateway")
            } footer: {
                Text("The default works in the iOS Simulator when the gateway runs on this Mac. A physical iPhone needs the Mac's reachable address and TLS before use outside a trusted development network.")
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
                LabeledContent("Phone voice", value: "Prototype")
            }
        }
        .navigationTitle("Settings")
    }
}
