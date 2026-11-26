import SwiftUI
import Speech
import AVFoundation

// MARK: - Lightweight Native Voice Dictation Helper

@MainActor
private final class VoiceSOSController: ObservableObject {
    @Published var isRecording: Bool = false
    @Published var statusNote: String?

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

    func toggleRecording(onTranscript: @escaping (String) -> Void) {
        if isRecording {
            stop()
            return
        }

        SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
            Task { @MainActor in
                guard let self else { return }
                guard authStatus == .authorized else {
                    self.statusNote = "Speech permission required for voice SOS"
                    return
                }
                self.start(onTranscript: onTranscript)
            }
        }
    }

    private func start(onTranscript: @escaping (String) -> Void) {
        stop()

        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            statusNote = "On-device speech recognizer unavailable on this Simulator"
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        recognitionRequest = request

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()
            isRecording = true
            statusNote = recognizer.supportsOnDeviceRecognition
                ? "Listening (On-Device Speech)..."
                : "Listening..."

            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                Task { @MainActor in
                    if let result {
                        onTranscript(result.bestTranscription.formattedString)
                    }
                    if error != nil || (result?.isFinal ?? false) {
                        self?.stop()
                    }
                }
            }
        } catch {
            statusNote = "Mic unavailable: \(error.localizedDescription)"
            stop()
        }
    }

    func stop() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        isRecording = false
    }
}

// MARK: - FieldNodeView (High-Contrast Dark Tactical Interface)

public struct FieldNodeView: View {
    @ObservedObject private var engine: HybridAIEngine
    @StateObject private var voice = VoiceSOSController()

    @State private var sosText: String = FieldCrisisPreset.samples[0].rawText
    @State private var editingRoom: Bool = false
    @State private var roomDraft: String = "CASCADIA-01"

    private let bgColor = Color(red: 0.035, green: 0.051, blue: 0.086)      // #090D16
    private let cardColor = Color(red: 0.067, green: 0.094, blue: 0.153)    // #111827
    private let borderColor = Color.white.opacity(0.10)

    public init(engine: HybridAIEngine) {
        self.engine = engine
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    tacticalHeader
                    offlineToggleCard
                    sosComposerCard

                    if let latest = engine.beacons.first {
                        privacyProofCard(beacon: latest)
                        survivalStepsCard(beacon: latest)
                    }

                    directivesSection
                    telemetryStripSection
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(bgColor.ignoresSafeArea())
            .navigationBarHidden(true)
            .alert("Command Room ID", isPresented: $editingRoom) {
                TextField("e.g. CASCADIA-01", text: $roomDraft)
                Button("Connect") {
                    let clean = roomDraft.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                    if !clean.isEmpty {
                        engine.listenForCloudDirectives(roomId: clean)
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Matches the Web Command Center room for Firestore beacon & directive sync.")
            }
        }
    }

    // MARK: - Header & Telemetry Pill

    private var tacticalHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .foregroundStyle(.amberAccent)
                        Text("ZEROBAR FIELD NODE")
                            .font(.system(.headline, design: .monospaced).weight(.bold))
                            .foregroundStyle(.white)
                    }
                    Text("\(engine.callsign) • \(engine.sectorLabel)")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                inferenceTelemetryPill
            }

            HStack(spacing: 8) {
                Button {
                    roomDraft = engine.roomId
                    editingRoom = true
                } label: {
                    Label("ROOM: \(engine.roomId)", systemImage: "link")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.white.opacity(0.08), in: Capsule())
                        .foregroundStyle(.white)
                }

                Label(
                    engine.appCheckActive ? "APP CHECK" : "APP CHECK (DEV)",
                    systemImage: "checkmark.shield.fill"
                )
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    (engine.appCheckActive ? Color.green : Color.orange).opacity(0.18),
                    in: Capsule()
                )
                .foregroundStyle(engine.appCheckActive ? .green : .orange)

                Spacer()
            }

            Text(engine.statusBanner)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.cyan)
        }
        .padding(14)
        .background(cardColor, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(borderColor, lineWidth: 1))
    }

    private var inferenceTelemetryPill: some View {
        let (label, color, icon): (String, Color, String) = {
            switch engine.lastInferenceSource {
            case .onDevice:
                return ("ON_DEVICE", .green, "cpu.fill")
            case .inCloud:
                return ("IN_CLOUD", .cyan, "cloud.fill")
            case .sandboxSim:
                return ("LOCAL_VAULT", .amberAccent, "lock.shield.fill")
            }
        }()

        return HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .bold))
            Text(label)
                .font(.system(size: 11, weight: .bold, design: .monospaced))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.18), in: Capsule())
        .overlay(Capsule().stroke(color.opacity(0.6), lineWidth: 1))
        .foregroundStyle(color)
    }

    // MARK: - 0-Bar Offline Mode Toggle

    private var offlineToggleCard: some View {
        HStack(spacing: 12) {
            Image(systemName: engine.isOfflineZeroBarMode ? "airplane" : "wifi")
                .font(.title3)
                .foregroundStyle(engine.isOfflineZeroBarMode ? .amberAccent : .green)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(engine.isOfflineZeroBarMode ? "0-BAR OFFLINE MODE" : "UPLINK ONLINE (HYBRID)")
                    .font(.system(.subheadline, design: .monospaced).weight(.bold))
                    .foregroundStyle(.white)
                Text(
                    engine.isOfflineZeroBarMode
                        ? "Strictly on-device inference • Beacons queued locally"
                        : "PREFER_ON_DEVICE + Cloud fallback • Auto-syncing Firestore"
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
            }

            Spacer()

            Toggle("", isOn: $engine.isOfflineZeroBarMode)
                .labelsHidden()
                .tint(.amberAccent)
        }
        .padding(14)
        .background(
            (engine.isOfflineZeroBarMode ? Color.orange.opacity(0.12) : Color.green.opacity(0.10)),
            in: RoundedRectangle(cornerRadius: 14)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(
                    (engine.isOfflineZeroBarMode ? Color.orange : Color.green).opacity(0.45),
                    lineWidth: 1
                )
        )
    }

    // MARK: - SOS Text & Voice Composer

    private var sosComposerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("CITIZEN SOS INPUT", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(.subheadline, design: .monospaced).weight(.bold))
                    .foregroundStyle(.red)
                Spacer()
                Text("\(sosText.utf8.count)B RAW")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            // Quick scenario chips for rapid demoing
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(FieldCrisisPreset.samples) { preset in
                        Button(preset.label) {
                            sosText = preset.rawText
                        }
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.08), in: Capsule())
                        .foregroundStyle(.white)
                    }
                }
            }

            TextEditor(text: $sosText)
                .frame(minHeight: 100)
                .padding(8)
                .scrollContentBackground(.hidden)
                .background(Color.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(borderColor, lineWidth: 1))
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(.white)

            if let voiceNote = voice.statusNote {
                Text(voiceNote)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.amberAccent)
            }

            HStack(spacing: 10) {
                Button {
                    voice.toggleRecording { transcript in
                        sosText = transcript
                    }
                } label: {
                    Label(voice.isRecording ? "Stop" : "Voice", systemImage: voice.isRecording ? "stop.circle.fill" : "mic.fill")
                        .font(.system(.subheadline, design: .monospaced).weight(.bold))
                        .frame(maxWidth: 110)
                        .padding(.vertical, 12)
                        .background(
                            (voice.isRecording ? Color.red : Color.white.opacity(0.10)),
                            in: RoundedRectangle(cornerRadius: 10)
                        )
                        .foregroundStyle(.white)
                }

                Button {
                    Task { await engine.submitDistress(rawInput: sosText) }
                } label: {
                    HStack(spacing: 8) {
                        if engine.isProcessing {
                            ProgressView()
                                .tint(.black)
                        } else {
                            Image(systemName: "bolt.shield.fill")
                        }
                        Text(engine.isProcessing ? "SCRUBBING..." : "EMIT <400B BEACON")
                            .font(.system(.subheadline, design: .monospaced).weight(.bold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.amberAccent, in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.black)
                }
                .disabled(engine.isProcessing || sosText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(14)
        .background(cardColor, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(borderColor, lineWidth: 1))
    }

    // MARK: - Privacy Vault & <400B Beacon Proof

    private func privacyProofCard(beacon: TriageBeacon) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("PRIVACY VAULT & WIRE BEACON", systemImage: "lock.fill")
                    .font(.system(.caption, design: .monospaced).weight(.bold))
                    .foregroundStyle(.green)
                Spacer()
                Text("\(beacon.rawBytes)B → \(beacon.beaconBytes)B")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(.amberAccent)
            }

            if !beacon.piiRedactedTypes.isEmpty {
                HStack(spacing: 6) {
                    Text("SCRUBBED:")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(.secondary)
                    ForEach(beacon.piiRedactedTypes, id: \.self) { tag in
                        Text(tag)
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.20), in: Capsule())
                            .foregroundStyle(.green)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(beacon.payload.sev.rawValue)
                        .font(.system(size: 11, weight: .black, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.red.opacity(0.25), in: RoundedRectangle(cornerRadius: 4))
                        .foregroundStyle(.red)

                    Text("\(beacon.payload.cat.rawValue) • \(beacon.payload.ppl) PPL")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)

                    Spacer()

                    Text(beacon.syncedToCloud ? "SYNCED" : "QUEUED LOCAL")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(beacon.syncedToCloud ? .cyan : .amberAccent)
                }

                Text(beacon.payload.sum)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(.top, 2)
            }
            .padding(10)
            .background(Color.black.opacity(0.40), in: RoundedRectangle(cornerRadius: 8))

            Text("rawInputLocalOnly excluded from Codable CodingKeys — never leaves iPhone.")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(cardColor, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.green.opacity(0.35), lineWidth: 1))
    }

    // MARK: - Instant Offline Survival Steps

    private func survivalStepsCard(beacon: TriageBeacon) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("INSTANT OFFLINE SURVIVAL STEPS", systemImage: "cross.case.fill")
                .font(.system(.subheadline, design: .monospaced).weight(.bold))
                .foregroundStyle(.amberAccent)

            ForEach(Array(beacon.localSurvivalSteps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 10) {
                    Text("\(index + 1)")
                        .font(.system(size: 12, weight: .black, design: .monospaced))
                        .frame(width: 22, height: 22)
                        .background(Color.amberAccent.opacity(0.22), in: Circle())
                        .foregroundStyle(.amberAccent)

                    Text(step)
                        .font(.system(.footnote))
                        .foregroundStyle(.white)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(cardColor, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.amberAccent.opacity(0.4), lineWidth: 1))
    }

    // MARK: - Cloud Directives Downlink List

    private var directivesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("CLOUD DIRECTIVES DOWNLINK", systemImage: "arrow.down.circle.fill")
                    .font(.system(.subheadline, design: .monospaced).weight(.bold))
                    .foregroundStyle(.cyan)
                Spacer()
                Text("\(engine.directives.count)")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.cyan.opacity(0.20), in: Capsule())
                    .foregroundStyle(.cyan)
            }

            if let summary = engine.latestBriefSummary {
                Text(summary)
                    .font(.system(.caption))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(10)
                    .background(Color.cyan.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            }

            if engine.directives.isEmpty {
                Text("Listening on rooms/\(engine.roomId)/briefs. Run Cloud Swarm Commander on the Web Command Center to push <1KB tactical directives here.")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
            } else {
                ForEach(engine.directives) { directive in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text("TO: \(directive.targetCallsign)")
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundStyle(.cyan)
                            Spacer()
                            Text("\(directive.bytes)B")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                        Text(directive.message)
                            .font(.system(.footnote))
                            .foregroundStyle(.white)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.black.opacity(0.40), in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(cardColor, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(borderColor, lineWidth: 1))
    }

    // MARK: - Live Hybrid Telemetry Log

    private var telemetryStripSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("HYBRID AI TELEMETRY", systemImage: "waveform.path.ecg")
                .font(.system(.caption, design: .monospaced).weight(.bold))
                .foregroundStyle(.secondary)

            if engine.telemetryLog.isEmpty {
                Text("Emit a beacon to inspect ONLY_ON_DEVICE vs PREFER_ON_DEVICE latency and inference source.")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.secondary)
            } else {
                ForEach(engine.telemetryLog.prefix(4)) { rec in
                    HStack {
                        Text(rec.operation.rawValue)
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                        Spacer()
                        Text(rec.modeConfigured.rawValue)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                        Text(rec.inferenceSource.rawValue)
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(rec.inferenceSource == .inCloud ? .cyan : .green)
                        Text("\(rec.latencyMs)ms")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.amberAccent)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(cardColor, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(borderColor, lineWidth: 1))
    }
}

private extension Color {
    static let amberAccent = Color(red: 0.96, green: 0.62, blue: 0.04) // #F59E0B
}

private extension ShapeStyle where Self == Color {
    static var amberAccent: Color { .amberAccent }
}
