package app.zerobar.field.models

import com.google.firebase.firestore.Exclude
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

// ============================================================================
// Hybrid AI Telemetry Enums (1:1 parity with src/types/mesh.ts & firestore.rules)
// ============================================================================

enum class InferenceSource(val wireValue: String) {
    ON_DEVICE("ON_DEVICE"),
    IN_CLOUD("IN_CLOUD"),
    SANDBOX_SIM("SANDBOX_SIM");

    companion object {
        fun fromWire(value: String?): InferenceSource =
            entries.firstOrNull { it.wireValue.equals(value, ignoreCase = true) } ?: SANDBOX_SIM
    }
}

enum class HybridModeTag(val wireValue: String) {
    ONLY_ON_DEVICE("ONLY_ON_DEVICE"),
    PREFER_ON_DEVICE("PREFER_ON_DEVICE"),
    PREFER_IN_CLOUD("PREFER_IN_CLOUD"),
    ONLY_IN_CLOUD("ONLY_IN_CLOUD");

    companion object {
        fun fromWire(value: String?): HybridModeTag =
            entries.firstOrNull { it.wireValue.equals(value, ignoreCase = true) } ?: PREFER_ON_DEVICE
    }
}

enum class Severity(val wireValue: String) {
    CRITICAL("CRITICAL"),
    HIGH("HIGH"),
    MODERATE("MODERATE"),
    LOW("LOW");

    companion object {
        fun fromWire(value: String?): Severity =
            entries.firstOrNull { it.wireValue.equals(value, ignoreCase = true) } ?: MODERATE
    }
}

enum class BeaconCategory(val wireValue: String, val chipLabel: String) {
    MEDICAL("MEDICAL", "Medical"),
    TRAPPED("TRAPPED", "Trapped"),
    INFRASTRUCTURE("INFRASTRUCTURE", "Infra"),
    FIRE_HAZARD("FIRE_HAZARD", "Fire / Gas"),
    WATER_FOOD("WATER_FOOD", "Water"),
    OTHER("OTHER", "Other");

    companion object {
        fun fromWire(value: String?): BeaconCategory =
            entries.firstOrNull { it.wireValue.equals(value, ignoreCase = true) } ?: OTHER
    }
}

enum class TelemetryOperation(val wireValue: String) {
    PII_SCRUB_VAULT("PII_SCRUB_VAULT"),
    TRIAGE_COMPRESS("TRIAGE_COMPRESS"),
    OFFLINE_SURVIVAL_COACH("OFFLINE_SURVIVAL_COACH"),
    CLOUD_SWARM_FUSION("CLOUD_SWARM_FUSION");

    companion object {
        fun fromWire(value: String?): TelemetryOperation =
            entries.firstOrNull { it.wireValue.equals(value, ignoreCase = true) } ?: TRIAGE_COMPRESS
    }
}

// ============================================================================
// TelemetryRecord
// ============================================================================

data class TelemetryRecord(
    val id: String = UUID.randomUUID().toString(),
    val operation: TelemetryOperation,
    val modeConfigured: HybridModeTag,
    val inferenceSource: InferenceSource,
    val latencyMs: Int,
    val rawBytes: Int? = null,
    val compressedBytes: Int? = null,
    val privacyPreserved: Boolean = true,
    val timestamp: Long = System.currentTimeMillis(),
    val note: String? = null
) {
    fun toFirestoreMap(): Map<String, Any> = buildMap {
        put("id", id)
        put("operation", operation.wireValue)
        put("modeConfigured", modeConfigured.wireValue)
        put("inferenceSource", inferenceSource.wireValue)
        put("latencyMs", latencyMs)
        rawBytes?.let { put("rawBytes", it) }
        compressedBytes?.let { put("compressedBytes", it) }
        put("privacyPreserved", privacyPreserved)
        put("timestamp", timestamp)
        note?.takeIf { it.isNotBlank() }?.let { put("note", it) }
    }

    companion object {
        fun fromFirestore(map: Map<String, Any?>?): TelemetryRecord {
            if (map == null) {
                return TelemetryRecord(
                    operation = TelemetryOperation.CLOUD_SWARM_FUSION,
                    modeConfigured = HybridModeTag.ONLY_IN_CLOUD,
                    inferenceSource = InferenceSource.IN_CLOUD,
                    latencyMs = 0,
                    privacyPreserved = true
                )
            }
            return TelemetryRecord(
                id = (map["id"] as? String) ?: UUID.randomUUID().toString(),
                operation = TelemetryOperation.fromWire(map["operation"] as? String),
                modeConfigured = HybridModeTag.fromWire(map["modeConfigured"] as? String),
                inferenceSource = InferenceSource.fromWire(map["inferenceSource"] as? String),
                latencyMs = (map["latencyMs"] as? Number)?.toInt() ?: 0,
                rawBytes = (map["rawBytes"] as? Number)?.toInt(),
                compressedBytes = (map["compressedBytes"] as? Number)?.toInt(),
                privacyPreserved = (map["privacyPreserved"] as? Boolean) ?: true,
                timestamp = (map["timestamp"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                note = map["note"] as? String
            )
        }
    }
}

// ============================================================================
// CompactBeaconPayload (<400B wire format validated by firestore.rules)
// ============================================================================

data class CompactBeaconPayload(
    val sev: Severity,
    val cat: BeaconCategory,
    val ppl: Int,
    val med: List<String>,
    val haz: List<String>,
    val loc: String,
    val sum: String,
    val ts: Long = System.currentTimeMillis()
) {
    val sanitizedPpl: Int get() = ppl.coerceIn(1, 10_000)
    val sanitizedMed: List<String> get() = med.map { it.trim() }.filter { it.isNotEmpty() }.take(4)
    val sanitizedHaz: List<String> get() = haz.map { it.trim() }.filter { it.isNotEmpty() }.take(4)
    val sanitizedLoc: String get() = loc.trim().ifEmpty { "Sector Unknown" }.take(36)
    val sanitizedSum: String get() = sum.trim().ifEmpty { "Emergency distress beacon" }.take(120)

    /** Exact UTF-8 JSON byte count used to verify the <400B mesh wire budget. */
    val encodedByteCount: Int
        get() {
            val json = JSONObject().apply {
                put("sev", sev.wireValue)
                put("cat", cat.wireValue)
                put("ppl", sanitizedPpl)
                put("med", JSONArray(sanitizedMed))
                put("haz", JSONArray(sanitizedHaz))
                put("loc", sanitizedLoc)
                put("sum", sanitizedSum)
                put("ts", ts.coerceAtLeast(1L))
            }
            return json.toString().toByteArray(Charsets.UTF_8).size
        }

    fun toFirestoreMap(): Map<String, Any> = mapOf(
        "sev" to sev.wireValue,
        "cat" to cat.wireValue,
        "ppl" to sanitizedPpl,
        "med" to sanitizedMed,
        "haz" to sanitizedHaz,
        "loc" to sanitizedLoc,
        "sum" to sanitizedSum,
        "ts" to ts.coerceAtLeast(1L)
    )

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromFirestore(map: Map<String, Any?>): CompactBeaconPayload = CompactBeaconPayload(
            sev = Severity.fromWire(map["sev"] as? String),
            cat = BeaconCategory.fromWire(map["cat"] as? String),
            ppl = (map["ppl"] as? Number)?.toInt()?.coerceIn(1, 10_000) ?: 1,
            med = (map["med"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
            haz = (map["haz"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
            loc = (map["loc"] as? String) ?: "Sector Unknown",
            sum = (map["sum"] as? String) ?: "",
            ts = (map["ts"] as? Number)?.toLong() ?: System.currentTimeMillis()
        )
    }
}

// ============================================================================
// Local-Only Struck-Through PII Visual Proof Segments (NEVER leaves RAM)
// ============================================================================

data class PiiDiffSegment(
    val text: String,
    val isRedactedPii: Boolean,
    val replacementTag: String? = null,
    val piiType: String? = null
)

// ============================================================================
// TriageBeacon (ZeroBar Privacy Invariant Enforced at Model & Serialization Layer)
// ============================================================================

/**
 * Mirrors `TriageBeacon` in `src/types/mesh.ts` and `firestore.rules`.
 *
 * **ZeroBar Privacy Invariant:** `rawInputLocalOnly` is annotated with `@get:Exclude`
 * and completely omitted from [toFirestoreMap], guaranteeing raw citizen PII can
 * NEVER be serialized to Cloud Firestore or P2P relay payloads.
 */
data class TriageBeacon(
    val id: String = "bcn-and-${UUID.randomUUID().toString().take(8).lowercase()}",
    val originNodeId: String,
    val originCallsign: String,
    @get:Exclude
    val rawInputLocalOnly: String = "[REDACTED_AT_ORIGIN_NODE]",
    @get:Exclude
    val localPiiDiffSegments: List<PiiDiffSegment> = emptyList(),
    val rawBytes: Int,
    val piiRedactedTypes: List<String>,
    val payload: CompactBeaconPayload,
    val beaconBytes: Int,
    val localSurvivalSteps: List<String>,
    val hops: List<String>,
    val syncedToCloud: Boolean = false,
    val syncedAt: Long? = null,
    val photoDataUrl: String? = null,
    val telemetry: TelemetryRecord
) {
    /**
     * Produces the strict Firestore document map matching `isValidBeaconWrite` in `firestore.rules`:
     * (`id`, `originNodeId`, `originCallsign`, `payload`, `beaconBytes`, `syncedToCloud`, `syncedAt`).
     */
    fun toFirestoreMap(syncedAtMs: Long = System.currentTimeMillis()): Map<String, Any> = buildMap {
        put("id", id.take(64))
        put("originNodeId", originNodeId.take(64))
        put("originCallsign", originCallsign.take(48))
        put("rawBytes", rawBytes.coerceIn(0, 65_536))
        put("piiRedactedTypes", piiRedactedTypes.take(16))
        put("payload", payload.toFirestoreMap())
        put("beaconBytes", beaconBytes.coerceIn(1, 2048))
        put("localSurvivalSteps", localSurvivalSteps.take(6))
        put("hops", hops.take(32))
        put("syncedToCloud", true)
        put("syncedAt", (syncedAt ?: syncedAtMs).coerceAtLeast(1L))
        photoDataUrl?.takeIf { it.isNotBlank() }?.let { put("photoDataUrl", it) }
        put("telemetry", telemetry.toFirestoreMap())
    }

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromFirestore(map: Map<String, Any?>): TriageBeacon {
            val payloadMap = (map["payload"] as? Map<String, Any?>) ?: emptyMap()
            val telemetryMap = map["telemetry"] as? Map<String, Any?>
            val payload = CompactBeaconPayload.fromFirestore(payloadMap)
            return TriageBeacon(
                id = (map["id"] as? String) ?: "bcn-unknown",
                originNodeId = (map["originNodeId"] as? String) ?: "unknown-node",
                originCallsign = (map["originCallsign"] as? String) ?: "UNKNOWN",
                rawInputLocalOnly = "[REDACTED_AT_ORIGIN_NODE]",
                localPiiDiffSegments = emptyList(),
                rawBytes = (map["rawBytes"] as? Number)?.toInt() ?: 0,
                piiRedactedTypes = (map["piiRedactedTypes"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
                payload = payload,
                beaconBytes = (map["beaconBytes"] as? Number)?.toInt() ?: payload.encodedByteCount,
                localSurvivalSteps = (map["localSurvivalSteps"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
                hops = (map["hops"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
                syncedToCloud = (map["syncedToCloud"] as? Boolean) ?: true,
                syncedAt = (map["syncedAt"] as? Number)?.toLong(),
                photoDataUrl = map["photoDataUrl"] as? String,
                telemetry = TelemetryRecord.fromFirestore(telemetryMap)
            )
        }
    }
}

// ============================================================================
// Cloud HQ Relay Directives & Incident Brief Downlink Models
// ============================================================================

data class DeduplicatedIncident(
    val id: String,
    val title: String,
    val severity: Severity,
    val mergedBeaconIds: List<String>,
    val estimatedPeople: Int,
    val sector: String,
    val actionPlan: String,
    val contradictionResolved: String? = null
) {
    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromFirestore(map: Map<String, Any?>): DeduplicatedIncident = DeduplicatedIncident(
            id = (map["id"] as? String) ?: UUID.randomUUID().toString(),
            title = (map["title"] as? String) ?: "Incident",
            severity = Severity.fromWire(map["severity"] as? String),
            mergedBeaconIds = (map["mergedBeaconIds"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
            estimatedPeople = (map["estimatedPeople"] as? Number)?.toInt() ?: 1,
            sector = (map["sector"] as? String) ?: "Sector Unknown",
            actionPlan = (map["actionPlan"] as? String) ?: "",
            contradictionResolved = map["contradictionResolved"] as? String
        )
    }
}

data class TacticalDirective(
    val id: String,
    val targetNodeId: String,
    val targetCallsign: String,
    val message: String,
    val bytes: Int,
    val issuedAt: Long,
    val deliveredViaRelay: Boolean
) {
    companion object {
        fun fromFirestore(map: Map<String, Any?>): TacticalDirective {
            val msg = (map["message"] as? String) ?: ""
            return TacticalDirective(
                id = (map["id"] as? String) ?: UUID.randomUUID().toString(),
                targetNodeId = (map["targetNodeId"] as? String) ?: "ALL",
                targetCallsign = (map["targetCallsign"] as? String) ?: "ALL-NODES",
                message = msg,
                bytes = (map["bytes"] as? Number)?.toInt() ?: msg.toByteArray(Charsets.UTF_8).size,
                issuedAt = (map["issuedAt"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                deliveredViaRelay = (map["deliveredViaRelay"] as? Boolean) ?: true
            )
        }
    }
}

data class CloudIncidentBrief(
    val id: String,
    val generatedAt: Long,
    val beaconsFusedCount: Int,
    val executiveSummary: String,
    val incidents: List<DeduplicatedIncident>,
    val directives: List<TacticalDirective>,
    val telemetry: TelemetryRecord
) {
    companion object {
        @Suppress("UNCHECKED_CAST")
        fun fromFirestore(map: Map<String, Any?>): CloudIncidentBrief {
            val rawIncidents = (map["incidents"] as? List<*>)
                ?.mapNotNull { it as? Map<String, Any?> }
                ?.map { DeduplicatedIncident.fromFirestore(it) }
                ?: emptyList()
            val rawDirectives = (map["directives"] as? List<*>)
                ?.mapNotNull { it as? Map<String, Any?> }
                ?.map { TacticalDirective.fromFirestore(it) }
                ?: emptyList()
            val telemetryMap = map["telemetry"] as? Map<String, Any?>

            return CloudIncidentBrief(
                id = (map["id"] as? String) ?: UUID.randomUUID().toString(),
                generatedAt = (map["generatedAt"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                beaconsFusedCount = (map["beaconsFusedCount"] as? Number)?.toInt() ?: 0,
                executiveSummary = (map["executiveSummary"] as? String) ?: "",
                incidents = rawIncidents,
                directives = rawDirectives,
                telemetry = TelemetryRecord.fromFirestore(telemetryMap)
            )
        }
    }
}

// ============================================================================
// Field Crisis Presets for Rapid Live Hackathon Demos
// ============================================================================

data class FieldCrisisPreset(
    val id: String,
    val label: String,
    val defaultCategory: BeaconCategory,
    val rawText: String
) {
    companion object {
        val samples: List<FieldCrisisPreset> = listOf(
            FieldCrisisPreset(
                id = "insulin-gas",
                label = "Insulin + Gas Leak",
                defaultCategory = BeaconCategory.MEDICAL,
                rawText = "My name is Elena Rostova, SSN 412-88-9012, phone 415-555-0194. Trapped at 412 Cedar Street with my husband. He is diabetic and out of insulin (Med ID #MED-88412). Strong gas smell in alley, stairwell collapsed."
            ),
            FieldCrisisPreset(
                id = "clinic-o2",
                label = "Clinic O2 Depletion",
                defaultCategory = BeaconCategory.MEDICAL,
                rawText = "Nurse Marcus Vance calling from 880 Harbor Ave clinic, phone 415-555-0133. 6 non-ambulatory patients on backup oxygen, generator dying in 45 minutes. North bridge ramp blocked by debris."
            ),
            FieldCrisisPreset(
                id = "bridge-route",
                label = "Bridge Out / Alt Route",
                defaultCategory = BeaconCategory.INFRASTRUCTURE,
                rawText = "My name is Devon Park, phone 415-555-0177. Harbor Bridge north span collapsed, 3 people injured with bleeding near east pier. South approach via Pine St is clear for ambulance extraction."
            )
        )
    }
}
