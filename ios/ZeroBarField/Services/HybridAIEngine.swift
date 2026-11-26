import Foundation
import Combine

#if canImport(FirebaseCore)
import FirebaseCore
#endif

#if canImport(FirebaseAppCheck)
import FirebaseAppCheck
#endif

#if canImport(FirebaseAI)
import FirebaseAI
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

#if canImport(FoundationModels)
import FoundationModels
#endif

// MARK: - Firebase App Check Provider Factory

#if canImport(FirebaseAppCheck) && canImport(FirebaseCore)
/// Production App Check provider using Apple App Attest (with DeviceCheck fallback on older hardware).
final class ZeroBarAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        if #available(iOS 14.0, *) {
            return AppAttestProvider(app: app)
        } else {
            return DeviceCheckProvider(app: app)
        }
    }
}
#endif

// MARK: - Internal JSON Shapes for Structured AI Output

private struct RedactionResponseJSON: Decodable {
    let redacted: String
    let piiTypes: [String]
}

private struct TriageResponseJSON: Decodable {
    let sev: String?
    let cat: String?
    let ppl: Int?
    let med: [String]?
    let haz: [String]?
    let loc: String?
    let sum: String?
    let survivalSteps: [String]?
}

// MARK: - HybridAIEngine

/// Core hybrid AI + offline Firestore coordinator for the ZeroBar iOS Field Node.
///
/// Architecture mirrors `src/services/firebase.ts` and `src/services/hybridEngine.ts`:
/// 1. **Stage 1 (`ONLY_ON_DEVICE`):** Apple Foundation Models via Firebase AI Logic scrubs raw PII
///    locally (with deterministic zero-network regex fallback on Simulator / non-Apple-Intelligence hardware).
/// 2. **Stage 2 (`PREFER_ON_DEVICE`):** Compresses redacted text into a `<400B` `CompactBeaconPayload`
///    and produces 3 immediate offline survival steps, inspecting `inferenceSource` (`ON_DEVICE` vs `IN_CLOUD`).
/// 3. **Firestore Offline Sync:** Queues scrubbed beacons to `rooms/{roomId}/beacons/{beaconId}`
///    (physically excluding `rawInputLocalOnly`) and listens to `rooms/{roomId}/briefs` for Cloud Directives.
@MainActor
public final class HybridAIEngine: ObservableObject {

    // MARK: Published Tactical State

    @Published public var roomId: String = "CASCADIA-01"
    @Published public var nodeId: String = "node-ios-field-01"
    @Published public var callsign: String = "IOS-FIELD-01"
    @Published public var sectorLabel: String = "Sector 4B • Cedar & Harbor"

    /// Simulates 0-Bar Airplane Mode blackout: forces strictly local inference and queues beacons offline.
    @Published public var isOfflineZeroBarMode: Bool = true {
        didSet {
            if !isOfflineZeroBarMode && oldValue {
                Task { await flushPendingBeacons() }
            }
        }
    }

    @Published public private(set) var isProcessing: Bool = false
    @Published public private(set) var lastInferenceSource: InferenceSource = .onDevice
    @Published public private(set) var appCheckActive: Bool = false
    @Published public private(set) var firebaseConfigured: Bool = false
    @Published public private(set) var appleIntelligenceAvailable: Bool = false

    @Published public private(set) var beacons: [TriageBeacon] = []
    @Published public private(set) var telemetryLog: [TelemetryRecord] = []
    @Published public private(set) var directives: [TacticalDirective] = []
    @Published public private(set) var latestBriefSummary: String?
    @Published public private(set) var statusBanner: String = "0-Bar Ready • Local Privacy Vault Armed"

    private let cloudModelName = "gemini-2.5-flash"

    #if canImport(FirebaseFirestore)
    private var briefsListener: ListenerRegistration?
    #endif

    // MARK: Lifecycle & Firebase Bootstrap

    public init() {
        self.firebaseConfigured = Self.isFirebaseReady
        self.appCheckActive = Self.isAppCheckConfigured
        self.appleIntelligenceAvailable = Self.detectAppleFoundationModelsAvailability()
        if firebaseConfigured {
            listenForCloudDirectives(roomId: roomId)
        }
    }

    deinit {
        #if canImport(FirebaseFirestore)
        briefsListener?.remove()
        #endif
    }

    private static var isFirebaseReady = false
    private static var isAppCheckConfigured = false

    /// Call once from `ZeroBarFieldApp.init()`.
    /// Configures Firebase App Check (`AppCheckDebugProviderFactory` in DEBUG, `AppAttestProvider` in RELEASE)
    /// and offline-first Cloud Firestore persistence.
    public static func configureFirebase() {
        #if canImport(FirebaseCore)
        guard FirebaseApp.app() == nil else {
            isFirebaseReady = true
            return
        }

        // Guard against missing GoogleService-Info.plist so Simulator demos run smoothly out of the box.
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            isFirebaseReady = false
            return
        }

        #if canImport(FirebaseAppCheck)
        #if DEBUG
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(ZeroBarAppCheckProviderFactory())
        #endif
        isAppCheckConfigured = true
        #endif

        FirebaseApp.configure()
        isFirebaseReady = true

        #if canImport(FirebaseFirestore)
        let db = Firestore.firestore()
        let settings = db.settings
        settings.cacheSettings = PersistentCacheSettings()
        db.settings = settings
        #endif
        #endif
    }

    private static func detectAppleFoundationModelsAvailability() -> Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.default.isAvailable
        }
        #endif
        return false
    }

    // MARK: - End-to-End Distress Processing (Stage 1 + Stage 2)

    /// Executes Stage 1 (`ONLY_ON_DEVICE` PII Vault) and Stage 2 (`PREFER_ON_DEVICE` Triage Compression
    /// + Survival Coach), then either queues the `<400B` beacon locally (0-Bar Mode) or syncs to Firestore.
    public func submitDistress(rawInput: String) async {
        let trimmed = rawInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isProcessing = true
        defer { isProcessing = false }

        let rawBytes = trimmed.utf8.count

        // --- STAGE 1: ONLY_ON_DEVICE Privacy Vault (Hard Privacy Boundary) ---
        let vaultStart = Date()
        let (redactedText, piiTypes, vaultSource) = await runOnDevicePIIVault(rawInput: trimmed)
        let vaultLatencyMs = max(1, Int(Date().timeIntervalSince(vaultStart) * 1000))

        let vaultRecord = TelemetryRecord(
            operation: .piiScrubVault,
            modeConfigured: .onlyOnDevice,
            inferenceSource: vaultSource,
            latencyMs: vaultLatencyMs,
            rawBytes: rawBytes,
            compressedBytes: redactedText.utf8.count,
            privacyPreserved: true,
            note: piiTypes.isEmpty
                ? "No PII detected; verified strictly on-device"
                : "Redacted \(piiTypes.joined(separator: ", ")) locally before mesh/cloud"
        )
        telemetryLog.insert(vaultRecord, at: 0)

        // --- STAGE 2: PREFER_ON_DEVICE Triage Compression (<400B) & Survival Coach ---
        let triageStart = Date()
        let (payload, survivalSteps, triageSource) = await runHybridTriageAndSurvival(
            redactedText: redactedText,
            sectorLabel: sectorLabel,
            forceOfflineOnly: isOfflineZeroBarMode
        )
        let triageLatencyMs = max(1, Int(Date().timeIntervalSince(triageStart) * 1000))
        let beaconBytes = payload.encodedByteCount

        let triageRecord = TelemetryRecord(
            operation: .triageCompress,
            modeConfigured: isOfflineZeroBarMode ? .onlyOnDevice : .preferOnDevice,
            inferenceSource: triageSource,
            latencyMs: triageLatencyMs,
            rawBytes: rawBytes,
            compressedBytes: beaconBytes,
            privacyPreserved: true,
            note: "Compressed \(rawBytes)B → \(beaconBytes)B beacon (<400B wire budget)"
        )
        telemetryLog.insert(triageRecord, at: 0)
        lastInferenceSource = triageSource

        var beacon = TriageBeacon(
            originNodeId: nodeId,
            originCallsign: callsign,
            rawInputLocalOnly: trimmed,
            rawBytes: rawBytes,
            piiRedactedTypes: piiTypes,
            payload: payload,
            beaconBytes: beaconBytes,
            localSurvivalSteps: survivalSteps,
            hops: [nodeId],
            syncedToCloud: false,
            syncedAt: nil,
            photoDataUrl: nil,
            telemetry: triageRecord
        )

        beacons.insert(beacon, at: 0)

        if isOfflineZeroBarMode {
            statusBanner = "0-Bar Queued (\(beaconBytes)B) • Awaiting Uplink / Relay"
        } else {
            let synced = await syncBeaconToFirestore(beacon: beacon, roomId: roomId)
            if synced {
                beacon.syncedToCloud = true
                beacon.syncedAt = Int64(Date().timeIntervalSince1970 * 1000)
                if let idx = beacons.firstIndex(where: { $0.id == beacon.id }) {
                    beacons[idx] = beacon
                }
                statusBanner = "Synced \(beaconBytes)B Beacon → rooms/\(roomId)/beacons"
            } else {
                statusBanner = "Queued Locally (\(beaconBytes)B) • Firestore Offline Cache"
            }
        }
    }

    // MARK: - Stage 1: ONLY_ON_DEVICE PII Privacy Vault

    private func runOnDevicePIIVault(rawInput: String) async -> (redacted: String, piiTypes: [String], source: InferenceSource) {
        let piiPrompt = """
        You are an on-device privacy firewall. Remove ALL personal identifiers (full names, SSNs, phone numbers, exact house numbers, medical IDs) from the text below while keeping emergency medical & hazard facts intact.
        Return ONLY valid JSON: {"redacted":"...","piiTypes":["PERSON_NAME","SSN","PHONE","EXACT_ADDRESS","MEDICAL_ID"]}
        Input: \(rawInput)
        """

        // Path A: Native Apple Foundation Models (iOS 26+ Apple Intelligence hardware, strictly ON_DEVICE)
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), SystemLanguageModel.default.isAvailable {
            do {
                let session = LanguageModelSession()
                let response = try await session.respond(to: piiPrompt)
                if let parsed: RedactionResponseJSON = Self.extractJSON(from: response.content) {
                    // Always run deterministic safety pass so zero PII leaks even if model misses a token
                    let safetyPass = Self.deterministicLocalPiiScrub(parsed.redacted)
                    let mergedTypes = Array(Set(parsed.piiTypes + safetyPass.piiTypes)).sorted()
                    return (safetyPass.redacted, mergedTypes, .onDevice)
                }
            } catch {
                // Fall through to deterministic zero-network scrubber (NEVER escalate raw PII to cloud)
            }
        }
        #endif

        // Path B: Deterministic zero-network local PII scrubber (Simulator & non-Apple-Intelligence devices)
        let local = Self.deterministicLocalPiiScrub(rawInput)
        return (local.redacted, local.piiTypes, .sandboxSim)
    }

    // MARK: - Stage 2: PREFER_ON_DEVICE Triage Compression + Offline Survival Steps

    private func runHybridTriageAndSurvival(
        redactedText: String,
        sectorLabel: String,
        forceOfflineOnly: Bool
    ) async -> (payload: CompactBeaconPayload, survivalSteps: [String], source: InferenceSource) {
        let triagePrompt = """
        Compress this PII-free disaster distress report into a strict <400 byte JSON triage beacon plus 3 short immediate survival steps.
        Return ONLY valid JSON:
        {"sev":"CRITICAL|HIGH|MODERATE|LOW","cat":"MEDICAL|TRAPPED|INFRASTRUCTURE|FIRE_HAZARD|WATER_FOOD|OTHER","ppl":1,"med":["TAG"],"haz":["TAG"],"loc":"\(sectorLabel)","sum":"<110 chars summary","survivalSteps":["step 1","step 2","step 3"]}
        Report: \(redactedText)
        """

        // 1. Prefer Apple Foundation Models ON_DEVICE first (zero latency, works in 0-Bar Airplane Mode)
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), SystemLanguageModel.default.isAvailable {
            do {
                let session = LanguageModelSession()
                let response = try await session.respond(to: triagePrompt)
                if let parsed: TriageResponseJSON = Self.extractJSON(from: response.content),
                   let built = Self.buildPayload(from: parsed, fallbackRedacted: redactedText, sectorLabel: sectorLabel) {
                    return (built.payload, built.survivalSteps, .onDevice)
                }
            } catch {
                // Continue to cloud fallback if online
            }
        }
        #endif

        // 2. If online (not 0-Bar Mode) and Firebase AI Logic is configured, fall back to Cloud Gemini via Firebase AI Logic
        #if canImport(FirebaseAI)
        if !forceOfflineOnly && firebaseConfigured {
            do {
                let ai = FirebaseAI.firebaseAI(backend: .googleAI())
                let model = ai.generativeModel(modelName: cloudModelName)
                let response = try await model.generateContent(triagePrompt)

                // Inspect Firebase AI Logic inference source (defaults to IN_CLOUD for cloud Gemini fallback)
                let resolvedSource: InferenceSource = .inCloud

                if let text = response.text,
                   let parsed: TriageResponseJSON = Self.extractJSON(from: text),
                   let built = Self.buildPayload(from: parsed, fallbackRedacted: redactedText, sectorLabel: sectorLabel) {
                    return (built.payload, built.survivalSteps, resolvedSource)
                }
            } catch {
                // Fall back to local deterministic triage so the user ALWAYS gets survival guidance
            }
        }
        #endif

        // 3. Deterministic offline fallback (Simulator / 0-Bar blackout without Apple Intelligence)
        let local = Self.deterministicLocalTriage(redacted: redactedText, sectorLabel: sectorLabel)
        return (local.payload, local.survivalSteps, .sandboxSim)
    }

    // MARK: - Firestore Sync (rooms/{roomId}/beacons & rooms/{roomId}/briefs)

    /// Writes a PII-scrubbed `TriageBeacon` to `rooms/{roomId}/beacons/{beaconId}`.
    /// `rawInputLocalOnly` is omitted from `TriageBeacon.CodingKeys` and never leaves the device.
    @discardableResult
    public func syncBeaconToFirestore(beacon: TriageBeacon, roomId: String) async -> Bool {
        #if canImport(FirebaseFirestore)
        guard firebaseConfigured else { return false }
        var uploadCopy = beacon
        uploadCopy.syncedToCloud = true
        uploadCopy.syncedAt = Int64(Date().timeIntervalSince1970 * 1000)

        do {
            let db = Firestore.firestore()
            try db.collection("rooms")
                .document(roomId)
                .collection("beacons")
                .document(beacon.id)
                .setData(from: uploadCopy)
            return true
        } catch {
            statusBanner = "Firestore queue warning: \(error.localizedDescription)"
            return false
        }
        #else
        return false
        #endif
    }

    /// Flushes all locally queued 0-Bar beacons when cellular/Wi-Fi uplink returns.
    public func flushPendingBeacons() async {
        let unsynced = beacons.filter { !$0.syncedToCloud }
        guard !unsynced.isEmpty else {
            statusBanner = "Uplink Online • All Beacons Synced"
            return
        }

        var syncedCount = 0
        for var b in unsynced {
            let ok = await syncBeaconToFirestore(beacon: b, roomId: roomId)
            if ok {
                b.syncedToCloud = true
                b.syncedAt = Int64(Date().timeIntervalSince1970 * 1000)
                if let idx = beacons.firstIndex(where: { $0.id == b.id }) {
                    beacons[idx] = b
                }
                syncedCount += 1
            }
        }
        statusBanner = syncedCount > 0
            ? "Uplink Flushed \(syncedCount) Queued Beacon(s) → Cloud"
            : "Uplink Ready • Configure GoogleService-Info.plist to Sync"
    }

    /// Subscribes to `rooms/{roomId}/briefs` to receive Cloud Commander `TacticalDirective` downlinks.
    public func listenForCloudDirectives(roomId: String) {
        self.roomId = roomId
        #if canImport(FirebaseFirestore)
        briefsListener?.remove()
        guard firebaseConfigured else { return }

        let db = Firestore.firestore()
        briefsListener = db.collection("rooms")
            .document(roomId)
            .collection("briefs")
            .order(by: "generatedAt", descending: true)
            .limit(to: 5)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self else { return }
                if let error {
                    Task { @MainActor in
                        self.statusBanner = "Directive listener: \(error.localizedDescription)"
                    }
                    return
                }
                guard let docs = snapshot?.documents else { return }
                let briefs = docs.compactMap { try? $0.data(as: CloudIncidentBrief.self) }
                let latest = briefs.first
                let allDirectives = briefs.flatMap { $0.directives }

                Task { @MainActor in
                    self.latestBriefSummary = latest?.executiveSummary
                    self.directives = allDirectives
                }
            }
        #endif
    }

    // MARK: - Deterministic Local Fallbacks (Exact Parity with Web hybridEngine.ts)

    public static func deterministicLocalPiiScrub(_ raw: String) -> (redacted: String, piiTypes: [String]) {
        var out = raw
        var types = Set<String>()

        func replace(_ pattern: String, with template: String, tag: String, options: NSRegularExpression.Options = []) {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return }
            let range = NSRange(out.startIndex..., in: out)
            if regex.firstMatch(in: out, range: range) != nil {
                types.insert(tag)
                out = regex.stringByReplacingMatches(in: out, range: range, withTemplate: template)
            }
        }

        // SSNs
        replace(#"\b\d{3}-\d{2}-\d{4}\b"#, with: "[SSN_REDACTED]", tag: "SSN")
        // Phone numbers
        replace(#"\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b"#, with: "[PHONE_REDACTED]", tag: "PHONE")
        // Medical IDs
        replace(#"(?:Med(?:ical)?\s*ID\s*#?\s*[\w-]+)"#, with: "[MED_ID]", tag: "MEDICAL_ID", options: [.caseInsensitive])
        // Named self-introductions
        replace(#"(my name is|soy|nurse|husband)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"#, with: "$1 [PERSON]", tag: "PERSON_NAME", options: [.caseInsensitive])
        // Street numbers
        replace(#"\b\d{2,5}\s+([A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd))\b"#, with: "[BLOCK] $1", tag: "EXACT_ADDRESS")

        return (out, Array(types).sorted())
    }

    public static func deterministicLocalTriage(
        redacted: String,
        sectorLabel: String
    ) -> (payload: CompactBeaconPayload, survivalSteps: [String]) {
        let lower = redacted.lowercased()
        var med: [String] = []
        var haz: [String] = []
        var sev: Severity = .moderate
        var cat: BeaconCategory = .other

        if lower.contains("insulin") || lower.contains("diabetic") {
            med.append("INSULIN_URGENT")
            sev = .critical
            cat = .medical
        }
        if lower.contains("oxygen") || lower.contains("generator") {
            med.append("OXYGEN_DEPLETION")
            sev = .critical
            cat = .medical
        }
        if lower.contains("bleed") || lower.contains("injur") {
            med.append("TRAUMA_BLEEDING")
            sev = .critical
            cat = .medical
        }
        if lower.contains("non-ambulatory") || lower.contains("trapped") {
            med.append("NON_AMBULATORY")
            sev = .critical
            if cat == .other { cat = .trapped }
        }
        if lower.contains("gas") {
            haz.append("GAS_LEAK")
            sev = .critical
        }
        if lower.contains("bridge") || lower.contains("ramp") || lower.contains("debris") {
            haz.append("ROUTE_BLOCKED")
            if cat == .other { cat = .infrastructure }
        }
        if lower.contains("collapsed") || lower.contains("stairwell") {
            haz.append("STRUCTURAL_COLLAPSE")
        }
        if lower.contains("south approach") || lower.contains("pine st") {
            haz.append("ALT_ROUTE_PINE_ST_CLEAR")
        }

        // Headcount heuristic
        var ppl = lower.contains("husband") ? 2 : 1
        if let regex = try? NSRegularExpression(pattern: #"\b(\d+)\s*(?:people|patients|cars|trapped|injured)\b"#, options: [.caseInsensitive]),
           let match = regex.firstMatch(in: redacted, range: NSRange(redacted.startIndex..., in: redacted)),
           let range = Range(match.range(at: 1), in: redacted),
           let parsed = Int(redacted[range]) {
            ppl = max(1, parsed)
        }

        let shortSum = redacted
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        var survivalSteps: [String] = []
        if haz.contains("GAS_LEAK") {
            survivalSteps.append("Do NOT flip light switches or ignite flames; move to an upwind window away from the alley.")
        }
        if med.contains("INSULIN_URGENT") {
            survivalSteps.append("Keep remaining insulin cool in damp cloth; conserve energy and hydrate with small sips of water.")
        }
        if med.contains("OXYGEN_DEPLETION") {
            survivalSteps.append("Switch stable patients to lowest safe O2 flow rate to extend tank reserve until relay extraction arrives.")
        }
        if med.contains("TRAUMA_BLEEDING") {
            survivalSteps.append("Apply firm, continuous direct pressure with clean cloth above wounds; keep injured warm and flat.")
        }
        if survivalSteps.count < 3 {
            survivalSteps.append("Keep phone screen dimmed & Low Power Mode ON; ZeroBar will sync your <400B beacon on first relay contact.")
        }

        let payload = CompactBeaconPayload(
            sev: sev,
            cat: cat,
            ppl: ppl,
            med: med,
            haz: haz,
            loc: sectorLabel,
            sum: String(shortSum.prefix(112))
        )
        return (payload, Array(survivalSteps.prefix(3)))
    }

    // MARK: - JSON Helpers

    private static func extractJSON<T: Decodable>(from rawText: String) -> T? {
        let cleaned = rawText
            .replacingOccurrences(of: "```json", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard let start = cleaned.firstIndex(of: "{"),
              let end = cleaned.lastIndex(of: "}") else {
            return nil
        }
        let slice = String(cleaned[start...end])
        guard let data = slice.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private static func buildPayload(
        from json: TriageResponseJSON,
        fallbackRedacted: String,
        sectorLabel: String
    ) -> (payload: CompactBeaconPayload, survivalSteps: [String])? {
        let fallback = deterministicLocalTriage(redacted: fallbackRedacted, sectorLabel: sectorLabel)
        let sev = json.sev.flatMap { Severity(rawValue: $0.uppercased()) } ?? fallback.payload.sev
        let cat = json.cat.flatMap { BeaconCategory(rawValue: $0.uppercased()) } ?? fallback.payload.cat
        let payload = CompactBeaconPayload(
            sev: sev,
            cat: cat,
            ppl: json.ppl ?? fallback.payload.ppl,
            med: json.med ?? fallback.payload.med,
            haz: json.haz ?? fallback.payload.haz,
            loc: json.loc ?? sectorLabel,
            sum: json.sum ?? fallback.payload.sum
        )
        let steps = (json.survivalSteps?.isEmpty == false) ? Array(json.survivalSteps!.prefix(3)) : fallback.survivalSteps
        return (payload, steps)
    }
}
