import MetaGunuCore
import SwiftUI

struct ConversationView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                statusOrb
                sourceCard
                controls
                if !model.liveTranscript.isEmpty { transcriptCard }
                progressCard
            }
            .padding()
        }
        .navigationTitle(model.assistantName)
        .background(Color(.systemGroupedBackground))
    }

    private var statusOrb: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(orbColor.opacity(0.16)).frame(width: 150, height: 150)
                Circle().fill(orbColor.gradient).frame(width: 106, height: 106)
                Image(systemName: icon).font(.system(size: 38, weight: .medium)).foregroundStyle(.white)
            }
            Text(model.stateTitle).font(.title2.bold())
            Text(model.stateDetail).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(.vertical, 12)
    }

    private var sourceCard: some View {
        HStack {
            Label(sourceLabel, systemImage: sourceIcon)
            Spacer()
            Text(model.laptopConnected ? "Laptop online" : "Laptop offline")
                .font(.caption.weight(.semibold))
                .foregroundStyle(model.laptopConnected ? .green : .secondary)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
    }

    private var controls: some View {
        VStack(spacing: 12) {
            if model.companion.mode == .stopped {
                Button(action: model.startGlassesListening) {
                    Label("Start glasses listening", systemImage: "eyeglasses")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(action: model.talkOnPhone) {
                    HStack {
                        if model.isStartingVoice { ProgressView().controlSize(.small) }
                        Label(model.isStartingVoice ? "Connecting…" : "Talk on iPhone", systemImage: "iphone.gen3")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(model.isStartingVoice)
            } else {
                if model.companion.phase == .waitingForWakePhrase {
                    Button("Simulate verified wake (development)", action: model.simulateVerifiedWakeForDevelopment)
                        .font(.caption)
                }
                if model.companion.phase == .conversing {
                    Button("End session", action: model.endSession)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                }
                Button("Stop listening", role: .destructive, action: model.stopListening)
                    .buttonStyle(.bordered)
                    .controlSize(.large)
            }
        }
    }

    private var transcriptCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Live transcript", systemImage: "text.bubble")
                .font(.headline)
            Text(model.liveTranscript)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
    }

    private var progressCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Monthly usage").font(.headline)
                Spacer()
                Text("$\(model.budgetSpent, specifier: "%.2f") / $\(model.budgetLimit, specifier: "%.0f")")
                    .font(.subheadline.monospacedDigit())
            }
            ProgressView(value: model.budgetSpent, total: model.budgetLimit)
            Text("Meta Gunu warns before the limit and suspends new cloud sessions at the limit.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
    }

    private var orbColor: Color {
        switch model.companion.phase {
        case .stopped: .secondary
        case .waitingForWakePhrase: .indigo
        case .conversing: .green
        case .interrupted: .orange
        }
    }

    private var icon: String {
        switch model.companion.phase {
        case .stopped: "mic.slash"
        case .waitingForWakePhrase: "ear"
        case .conversing: "waveform"
        case .interrupted: "exclamationmark.triangle"
        }
    }

    private var sourceLabel: String {
        switch model.companion.mode {
        case .stopped: "No audio source"
        case .glasses: "Glasses microphone only"
        case .phone: "iPhone microphone — explicitly enabled"
        }
    }

    private var sourceIcon: String {
        model.companion.mode == .glasses ? "eyeglasses" : (model.companion.mode == .phone ? "iphone" : "mic.slash")
    }
}
