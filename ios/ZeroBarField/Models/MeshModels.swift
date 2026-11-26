import Foundation

// MARK: - Hybrid AI Telemetry Enums (1:1 parity with src/types/mesh.ts)

public enum InferenceSource: String, Codable, Sendable {
    case onDevice = "ON_DEVICE"
    case inCloud = "IN_CLOUD"
    case sandboxSim = "SANDBOX_SIM"
}

public enum HybridModeTag: String, Codable, Sendable {
    case onlyOnDevice = "ONLY_ON_DEVICE"
    case preferOnDevice = "PREFER_ON_DEVICE"
    case preferInCloud = "PREFER_IN_CLOUD"
    case onlyInCloud = "ONLY_IN_CLOUD"
}

public enum Severity: String, Codable, Sendable, CaseIterable {
    case critical = "CRITICAL"
    case high = "HIGH"
    case moderate = "MODERATE"
    case low = "LOW"
}

public enum BeaconCategory: String, Codable, Sendable, CaseIterable {
    case medical = "MEDICAL"
    case trapped = "TRAPPED"
    case infrastructure = "INFRASTRUCTURE"
    case fireHazard = "FIRE_HAZARD"
    case waterFood = "WATER_FOOD"
    case other = "OTHER"
}

public enum TelemetryOperation: String, Codable, Sendable {
    case piiScrubVault = "PII_SCRUB_VAULT"
    case triageCompress = "TRIAGE_COMPRESS"
    case offlineSurvivalCoach = "OFFLINE_SURVIVAL_COACH"
    case cloudSwarmFusion = "CLOUD_SWARM_FUSION"
}

// MARK: - TelemetryRecord

public struct TelemetryRecord: Codable, Identifiable, Sendable {
    public let id: String
    public let operation: TelemetryOperation
    public let modeConfigured: HybridModeTag
    public let inferenceSource: InferenceSource
    public let latencyMs: Int
    public let rawBytes: Int?
    public let compressedBytes: Int?
    public let privacyPreserved: Bool
    /// Epoch milliseconds matching JS `Date.now()`
    public let timestamp: Int64
    public let note: String?

    public init(
        id: String = UUID().uuidString,
        operation: TelemetryOperation,
        modeConfigured: HybridModeTag,
        inferenceSource: InferenceSource,
        latencyMs: Int,
        rawBytes: Int? = nil,
        compressedBytes: Int? = nil,
        privacyPreserved: Bool,
        timestamp: Int64 = Int64(Date().timeIntervalSince1970 * 1000),
        note: String? = nil
    ) {
        self.id = id
        self.operation = operation
        self.modeConfigured = modeConfigured
        self.inferenceSource = inferenceSource
        self.latencyMs = latencyMs
        self.rawBytes = rawBytes
        self.compressedBytes = compressedBytes
        self.privacyPreserved = privacyPreserved
        self.timestamp = timestamp
        self.note = note
    }
}

// MARK: - CompactBeaconPayload (<400B wire format)

public struct CompactBeaconPayload: Codable, Sendable {
    public let sev: Severity
    public let cat: BeaconCategory
    public let ppl: Int
    /// Anonymized medical tags e.g. ["INSULIN_URGENT", "NON_AMBULATORY"]
    public let med: [String]
    /// Hazard tags e.g. ["ROUTE_BLOCKED", "GAS_LEAK"]
    public let haz: [String]
    /// Coarse sector / landmark (never exact house number)
    public let loc: String
    /// Ultra-short PII-free summary (<120 chars)
    public let sum: String
    /// Epoch milliseconds matching JS `Date.now()`
    public let ts: Int64

    public init(
        sev: Severity,
        cat: BeaconCategory,
        ppl: Int,
        med: [String],
        haz: [String],
        loc: String,
        sum: String,
        ts: Int64 = Int64(Date().timeIntervalSince1970 * 1000)
    ) {
        self.sev = sev
        self.cat = cat
        self.ppl = max(1, ppl)
        self.med = Array(med.prefix(4))
        self.haz = Array(haz.prefix(4))
        self.loc = String(loc.prefix(36))
        self.sum = String(sum.prefix(120))
        self.ts = ts
    }

    /// Exact UTF-8 JSON byte length used to verify the <400B mesh packet budget.
    public var encodedByteCount: Int {
        (try? JSONEncoder().encode(self).count) ?? 0
    }
}

// MARK: - TriageBeacon (Privacy Invariant Enforced at Codable Layer)

/// Mirrors `TriageBeacon` in `src/types/mesh.ts`.
///
/// **ZeroBar Privacy Invariant:** `rawInputLocalOnly` is intentionally OMITTED from
/// `CodingKeys`. It is physically impossible for `JSONEncoder` or `Firestore.Encoder`
/// to serialize raw citizen distress text or PII to Firestore or the mesh wire.
public struct TriageBeacon: Codable, Identifiable, Sendable {
    public let id: String
    public let originNodeId: String
    public let originCallsign: String

    /// Raw citizen text stays STRICTLY in local memory — NEVER encoded to Firestore.
    public var rawInputLocalOnly: String

    public let rawBytes: Int
    public let piiRedactedTypes: [String]
    public let payload: CompactBeaconPayload
    public let beaconBytes: Int
    public let localSurvivalSteps: [String]
    public var hops: [String]
    public var syncedToCloud: Bool
    public var syncedAt: Int64?
    public let photoDataUrl: String?
    public let telemetry: TelemetryRecord

    private enum CodingKeys: String, CodingKey {
        case id
        case originNodeId
        case originCallsign
        // rawInputLocalOnly is DELIBERATELY EXCLUDED so it can NEVER leave the device.
        case rawBytes
        case piiRedactedTypes
        case payload
        case beaconBytes
        case localSurvivalSteps
        case hops
        case syncedToCloud
        case syncedAt
        case photoDataUrl
        case telemetry
    }

    public init(
        id: String = "bcn-ios-\(UUID().uuidString.prefix(8).lowercased())",
        originNodeId: String,
        originCallsign: String,
        rawInputLocalOnly: String,
        rawBytes: Int,
        piiRedactedTypes: [String],
        payload: CompactBeaconPayload,
        beaconBytes: Int,
        localSurvivalSteps: [String],
        hops: [String],
        syncedToCloud: Bool = false,
        syncedAt: Int64? = nil,
        photoDataUrl: String? = nil,
        telemetry: TelemetryRecord
    ) {
        self.id = id
        self.originNodeId = originNodeId
        self.originCallsign = originCallsign
        self.rawInputLocalOnly = rawInputLocalOnly
        self.rawBytes = rawBytes
        self.piiRedactedTypes = piiRedactedTypes
        self.payload = payload
        self.beaconBytes = beaconBytes
        self.localSurvivalSteps = localSurvivalSteps
        self.hops = hops
        self.syncedToCloud = syncedToCloud
        self.syncedAt = syncedAt
        self.photoDataUrl = photoDataUrl
        self.telemetry = telemetry
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        originNodeId = try c.decode(String.self, forKey: .originNodeId)
        originCallsign = try c.decode(String.self, forKey: .originCallsign)
        rawInputLocalOnly = "[REDACTED_AT_ORIGIN_NODE]"
        rawBytes = try c.decode(Int.self, forKey: .rawBytes)
        piiRedactedTypes = try c.decode([String].self, forKey: .piiRedactedTypes)
        payload = try c.decode(CompactBeaconPayload.self, forKey: .payload)
        beaconBytes = try c.decode(Int.self, forKey: .beaconBytes)
        localSurvivalSteps = try c.decode([String].self, forKey: .localSurvivalSteps)
        hops = try c.decode([String].self, forKey: .hops)
        syncedToCloud = try c.decode(Bool.self, forKey: .syncedToCloud)
        syncedAt = try c.decodeIfPresent(Int64.self, forKey: .syncedAt)
        photoDataUrl = try c.decodeIfPresent(String.self, forKey: .photoDataUrl)
        telemetry = try c.decode(TelemetryRecord.self, forKey: .telemetry)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(originNodeId, forKey: .originNodeId)
        try c.encode(originCallsign, forKey: .originCallsign)
        try c.encode(rawBytes, forKey: .rawBytes)
        try c.encode(piiRedactedTypes, forKey: .piiRedactedTypes)
        try c.encode(payload, forKey: .payload)
        try c.encode(beaconBytes, forKey: .beaconBytes)
        try c.encode(localSurvivalSteps, forKey: .localSurvivalSteps)
        try c.encode(hops, forKey: .hops)
        try c.encode(syncedToCloud, forKey: .syncedToCloud)
        try c.encodeIfPresent(syncedAt, forKey: .syncedAt)
        try c.encodeIfPresent(photoDataUrl, forKey: .photoDataUrl)
        try c.encode(telemetry, forKey: .telemetry)
    }
}

// MARK: - Cloud Command Center Downlink Models

public struct DeduplicatedIncident: Codable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let severity: Severity
    public let mergedBeaconIds: [String]
    public let estimatedPeople: Int
    public let sector: String
    public let actionPlan: String
    public let contradictionResolved: String?
}

public struct TacticalDirective: Codable, Identifiable, Sendable {
    public let id: String
    public let targetNodeId: String
    public let targetCallsign: String
    public let message: String
    public let bytes: Int
    public let issuedAt: Int64
    public let deliveredViaRelay: Bool
}

public struct CloudIncidentBrief: Codable, Identifiable, Sendable {
    public let id: String
    public let generatedAt: Int64
    public let beaconsFusedCount: Int
    public let executiveSummary: String
    public let incidents: [DeduplicatedIncident]
    public let directives: [TacticalDirective]
    public let telemetry: TelemetryRecord
}

// MARK: - Field Presets for Rapid Hackathon Demo

public struct FieldCrisisPreset: Identifiable, Sendable {
    public let id: String
    public let label: String
    public let rawText: String

    public static let samples: [FieldCrisisPreset] = [
        FieldCrisisPreset(
            id: "insulin-gas",
            label: "Insulin + Gas Leak",
            rawText: "My name is Elena Rostova, SSN 412-88-9012, phone 415-555-0194. Trapped at 412 Cedar Street with my husband. He is diabetic and out of insulin (Med ID #MED-88412). Strong gas smell in alley, stairwell collapsed."
        ),
        FieldCrisisPreset(
            id: "clinic-o2",
            label: "Clinic O2 Depletion",
            rawText: "Nurse Marcus Vance calling from 880 Harbor Ave clinic, phone 415-555-0133. 6 non-ambulatory patients on backup oxygen, generator dying in 45 minutes. North bridge ramp blocked by debris."
        ),
        FieldCrisisPreset(
            id: "route-clear",
            label: "Bridge Out / Alt Route",
            rawText: "My name is Devon Park, phone 415-555-0177. Harbor Bridge north span collapsed, 3 people injured with bleeding near east pier. South approach via Pine St is clear for ambulance extraction."
        )
    ]
}
