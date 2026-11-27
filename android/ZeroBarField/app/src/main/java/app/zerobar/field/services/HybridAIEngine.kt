package app.zerobar.field.services

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zerobar.field.BuildConfig
import app.zerobar.field.models.BeaconCategory
import app.zerobar.field.models.CloudIncidentBrief
import app.zerobar.field.models.CompactBeaconPayload
import app.zerobar.field.models.HybridModeTag
import app.zerobar.field.models.InferenceSource
import app.zerobar.field.models.PiiDiffSegment
import app.zerobar.field.models.Severity
import app.zerobar.field.models.TacticalDirective
import app.zerobar.field.models.TelemetryOperation
import app.zerobar.field.models.TelemetryRecord
import app.zerobar.field.models.TriageBeacon
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.InferenceMode
import com.google.firebase.ai.type.InferenceSource as FirebaseInferenceSource
import com.google.firebase.ai.type.OnDeviceConfig
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.PersistentCacheSettings
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

data class FieldNodeUiState(
    val roomId: String = "CASCADIA-01",
    val nodeId: String = "node-and-field-01",
    val callsign: String = "AND-FIELD-01",
    val sectorLabel: String = "Sector 4B • Cedar & Harbor",
    val isOfflineZeroBarMode: Boolean = true,
    val selectedCategoryOverride: BeaconCategory? = null,
    val isProcessing: Boolean = false,
    val lastInferenceSource: InferenceSource = InferenceSource.ON_DEVICE,
    val appCheckActive: Boolean = false,
    val firebaseConfigured: Boolean = false,
    val beacons: List<TriageBeacon> = emptyList(),
    val telemetryLog: List<TelemetryRecord> = emptyList(),
    val directives: List<TacticalDirective> = emptyList(),
    val latestBriefSummary: String? = null,
    val statusBanner: String = "0-Bar Ready • AICore Privacy Vault Armed"
)

/**
 * Core Hybrid AI + Offline Firestore coordinator for the ZeroBar Android Field Node.
 *
 * Architecture mirrors `src/services/firebase.ts`, `src/services/hybridEngine.ts`,
 * and `ios/ZeroBarField/Services/HybridAIEngine.swift`:
 * 1. **Stage 1 (`ONLY_ON_DEVICE`):** Runs local Gemini Nano via Android AICore (`firebase-ai-ondevice`)
 *    to scrub raw PII before any bytes leave RAM, paired with a deterministic local regex safety pass
 *    (and full emulator fallback when AICore hardware is absent).
 * 2. **Stage 2 (`PREFER_ON_DEVICE`):** Compresses PII-free distress text into a `<400B`
 *    [CompactBeaconPayload] + 3 immediate offline survival steps, preferring on-device AICore
 *    and falling back to Cloud `gemini-2.5-flash` when online while inspecting `response.inferenceSource`.
 * 3. **Firestore Offline Sync:** Writes strictly PII-free payloads via [TriageBeacon.toFirestoreMap]
 *    to `rooms/{roomId}/beacons/{id}` and subscribes to `rooms/{roomId}/briefs` for HQ directives.
 */
@OptIn(PublicPreviewAPI::class)
class HybridAIEngine : ViewModel() {

    private val _uiState = MutableStateFlow(
        FieldNodeUiState(
            firebaseConfigured = isFirebaseReady,
            appCheckActive = isAppCheckConfigured
        )
    )
    val uiState: StateFlow<FieldNodeUiState> = _uiState.asStateFlow()

    private var briefsListener: ListenerRegistration? = null

    init {
        if (isFirebaseReady) {
            listenForCloudDirectives(_uiState.value.roomId)
        }
    }

    override fun onCleared() {
        briefsListener?.remove()
        super.onCleared()
    }

    // ========================================================================
    // UI Controls (0-Bar Toggle, Category Override, Room Selection)
    // ========================================================================

    fun setOfflineZeroBarMode(offline: Boolean) {
        val wasOffline = _uiState.value.isOfflineZeroBarMode
        _uiState.update {
            it.copy(
                isOfflineZeroBarMode = offline,
                statusBanner = if (offline) {
                    "0-Bar Blackout Armed • Strictly Local Inference & Queue"
                } else {
                    "Uplink Restored • Hybrid AI + Firestore Sync Active"
                }
            )
        }
        if (!offline && wasOffline) {
            viewModelScope.launch { flushPendingBeacons() }
        }
    }

    fun setCategoryOverride(category: BeaconCategory?) {
        _uiState.update { state ->
            val next = if (state.selectedCategoryOverride == category) null else category
            state.copy(selectedCategoryOverride = next)
        }
    }

    // ========================================================================
    // End-to-End Distress Pipeline (Stage 1 Vault + Stage 2 Triage + Sync)
    // ========================================================================

    fun submitDistress(rawText: String) {
        val trimmed = rawText.trim()
        if (trimmed.isEmpty() || _uiState.value.isProcessing) return

        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true) }
            try {
                processDistressInternal(trimmed)
            } finally {
                _uiState.update { it.copy(isProcessing = false) }
            }
        }
    }

    private suspend fun processDistressInternal(trimmedInput: String) {
        val snapshot = _uiState.value
        val rawBytes = trimmedInput.toByteArray(Charsets.UTF_8).size

        // --- STAGE 1: ONLY_ON_DEVICE Privacy Vault (AICore Gemini Nano + Deterministic Guard) ---
        val vaultStartMs = System.currentTimeMillis()
        val vaultOutcome = runOnDevicePiiVault(trimmedInput)
        val piiDiffSegments = computePiiDiffSegments(trimmedInput)
        val vaultLatencyMs = (System.currentTimeMillis() - vaultStartMs).toInt().coerceAtLeast(1)

        val typesJoined = vaultOutcome.piiTypes.joinToString(", ")
        val vaultTelemetry = TelemetryRecord(
            operation = TelemetryOperation.PII_SCRUB_VAULT,
            modeConfigured = HybridModeTag.ONLY_ON_DEVICE,
            inferenceSource = vaultOutcome.source,
            latencyMs = vaultLatencyMs,
            rawBytes = rawBytes,
            compressedBytes = vaultOutcome.redactedText.toByteArray(Charsets.UTF_8).size,
            privacyPreserved = true,
            note = if (vaultOutcome.piiTypes.isEmpty()) {
                "Verified zero PII strictly on-device"
            } else {
                "Scrubbed $typesJoined locally in RAM"
            }
        )

        // --- STAGE 2: PREFER_ON_DEVICE Triage Compression (<400B) & 3 Survival Steps ---
        val triageStartMs = System.currentTimeMillis()
        val triageOutcome = runHybridTriageAndSurvival(
            redactedText = vaultOutcome.redactedText,
            sectorLabel = snapshot.sectorLabel,
            categoryOverride = snapshot.selectedCategoryOverride,
            forceOfflineOnly = snapshot.isOfflineZeroBarMode
        )
        val triageLatencyMs = (System.currentTimeMillis() - triageStartMs).toInt().coerceAtLeast(1)
        val beaconBytes = triageOutcome.payload.encodedByteCount

        val triageTelemetry = TelemetryRecord(
            operation = TelemetryOperation.TRIAGE_COMPRESS,
            modeConfigured = if (snapshot.isOfflineZeroBarMode) {
                HybridModeTag.ONLY_ON_DEVICE
            } else {
                HybridModeTag.PREFER_ON_DEVICE
            },
            inferenceSource = triageOutcome.source,
            latencyMs = triageLatencyMs,
            rawBytes = rawBytes,
            compressedBytes = beaconBytes,
            privacyPreserved = true,
            note = "Compressed ${rawBytes}B → ${beaconBytes}B (<400B mesh wire budget)"
        )

        var beacon = TriageBeacon(
            originNodeId = snapshot.nodeId,
            originCallsign = snapshot.callsign,
            rawInputLocalOnly = trimmedInput,
            localPiiDiffSegments = piiDiffSegments,
            rawBytes = rawBytes,
            piiRedactedTypes = vaultOutcome.piiTypes,
            payload = triageOutcome.payload,
            beaconBytes = beaconBytes,
            localSurvivalSteps = triageOutcome.survivalSteps,
            hops = listOf(snapshot.nodeId),
            syncedToCloud = false,
            syncedAt = null,
            photoDataUrl = null,
            telemetry = triageTelemetry
        )

        _uiState.update { state ->
            state.copy(
                lastInferenceSource = triageOutcome.source,
                beacons = listOf(beacon) + state.beacons,
                telemetryLog = listOf(triageTelemetry, vaultTelemetry) + state.telemetryLog,
                statusBanner = if (state.isOfflineZeroBarMode) {
                    "0-Bar Queued (${beaconBytes}B) • Awaiting Relay / Uplink"
                } else {
                    "Syncing ${beaconBytes}B Beacon → rooms/${state.roomId}/beacons..."
                }
            )
        }

        if (!snapshot.isOfflineZeroBarMode) {
            val syncedAtMs = System.currentTimeMillis()
            val synced = syncBeaconToFirestore(beacon, snapshot.roomId, syncedAtMs)
            if (synced) {
                beacon = beacon.copy(syncedToCloud = true, syncedAt = syncedAtMs)
                _uiState.update { state ->
                    state.copy(
                        beacons = state.beacons.map { if (it.id == beacon.id) beacon else it },
                        statusBanner = "Synced ${beaconBytes}B Beacon → rooms/${state.roomId}/beacons"
                    )
                }
            } else {
                _uiState.update { state ->
                    state.copy(
                        statusBanner = "Queued Locally (${beaconBytes}B) • Add google-services.json for Cloud Sync"
                    )
                }
            }
        }
    }

    // ========================================================================
    // Stage 1: ONLY_ON_DEVICE AICore Gemini Nano Privacy Vault
    // ========================================================================

    private data class VaultOutcome(
        val redactedText: String,
        val piiTypes: List<String>,
        val source: InferenceSource
    )

    private suspend fun runOnDevicePiiVault(inputText: String): VaultOutcome {
        val vaultPrompt = """
            You are an on-device emergency privacy firewall. Scrub ALL personal identifiers (full names, SSNs, phone numbers, exact street house numbers, medical IDs) while preserving medical and hazard facts.
            Return ONLY valid JSON: {"redacted":"...","piiTypes":["PERSON_NAME","SSN","PHONE","EXACT_ADDRESS","MEDICAL_ID"]}
            Input: $inputText
        """.trimIndent()

        if (isFirebaseReady) {
            try {
                val ai = Firebase.ai(backend = GenerativeBackend.googleAI())
                val privacyVaultModel = ai.generativeModel(
                    modelName = CLOUD_MODEL_NAME,
                    onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE)
                )
                val response = privacyVaultModel.generateContent(vaultPrompt)
                val responseText = response.text
                if (!responseText.isNullOrBlank()) {
                    val parsed = parseRedactionJson(responseText)
                    if (parsed != null) {
                        // Always enforce deterministic regex guard over LLM output so zero SSNs/phones slip through
                        val safetyPass = deterministicLocalPiiScrub(parsed.first)
                        val mergedTypes = (parsed.second + safetyPass.second).distinct().sorted()
                        val resolvedSource = when (response.inferenceSource) {
                            FirebaseInferenceSource.ON_DEVICE -> InferenceSource.ON_DEVICE
                            FirebaseInferenceSource.IN_CLOUD -> InferenceSource.IN_CLOUD
                            else -> InferenceSource.ON_DEVICE
                        }
                        return VaultOutcome(safetyPass.first, mergedTypes, resolvedSource)
                    }
                }
            } catch (_: Exception) {
                // AICore unavailable (e.g., standard emulator) -> fall through to local deterministic vault.
                // NEVER fall back to cloud with unredacted citizen input.
            }
        }

        val local = deterministicLocalPiiScrub(inputText)
        return VaultOutcome(local.first, local.second, InferenceSource.SANDBOX_SIM)
    }

    // ========================================================================
    // Stage 2: PREFER_ON_DEVICE Triage Compression + 3 Offline Survival Steps
    // ========================================================================

    private data class TriageOutcome(
        val payload: CompactBeaconPayload,
        val survivalSteps: List<String>,
        val source: InferenceSource
    )

    private suspend fun runHybridTriageAndSurvival(
        redactedText: String,
        sectorLabel: String,
        categoryOverride: BeaconCategory?,
        forceOfflineOnly: Boolean
    ): TriageOutcome {
        val categoryHint = categoryOverride?.let { "Preferred category: ${it.wireValue}." } ?: ""
        val triagePrompt = """
            Compress this PII-free disaster distress report into a strict <400 byte JSON triage beacon plus 3 concise immediate offline survival steps. $categoryHint
            Return ONLY valid JSON:
            {"sev":"CRITICAL|HIGH|MODERATE|LOW","cat":"MEDICAL|TRAPPED|INFRASTRUCTURE|FIRE_HAZARD|WATER_FOOD|OTHER","ppl":1,"med":["TAG"],"haz":["TAG"],"loc":"$sectorLabel","sum":"<110 chars PII-free summary","survivalSteps":["step 1","step 2","step 3"]}
            Report: $redactedText
        """.trimIndent()

        if (isFirebaseReady) {
            try {
                val ai = Firebase.ai(backend = GenerativeBackend.googleAI())
                val inferenceMode = if (forceOfflineOnly) {
                    InferenceMode.ONLY_ON_DEVICE
                } else {
                    InferenceMode.PREFER_ON_DEVICE
                }
                val edgeTriageModel = ai.generativeModel(
                    modelName = CLOUD_MODEL_NAME,
                    onDeviceConfig = OnDeviceConfig(mode = inferenceMode)
                )
                val response = edgeTriageModel.generateContent(triagePrompt)
                val resolvedSource = when (response.inferenceSource) {
                    FirebaseInferenceSource.ON_DEVICE -> InferenceSource.ON_DEVICE
                    FirebaseInferenceSource.IN_CLOUD -> InferenceSource.IN_CLOUD
                    else -> if (forceOfflineOnly) InferenceSource.ON_DEVICE else InferenceSource.IN_CLOUD
                }

                val responseText = response.text
                if (!responseText.isNullOrBlank()) {
                    val built = parseTriageJson(
                        rawText = responseText,
                        fallbackRedacted = redactedText,
                        sectorLabel = sectorLabel,
                        categoryOverride = categoryOverride
                    )
                    if (built != null) {
                        return TriageOutcome(built.first, built.second, resolvedSource)
                    }
                }
            } catch (_: Exception) {
                // Offline without AICore or transient network blackout -> deterministic survival coach ensures 100% uptime
            }
        }

        val fallback = deterministicLocalTriage(redactedText, sectorLabel, categoryOverride)
        return TriageOutcome(fallback.first, fallback.second, InferenceSource.SANDBOX_SIM)
    }

    // ========================================================================
    // Cloud Firestore Sync & Tactical Directive Listener
    // ========================================================================

    suspend fun syncBeaconToFirestore(
        beacon: TriageBeacon,
        roomId: String,
        syncedAtMs: Long = System.currentTimeMillis()
    ): Boolean {
        if (!isFirebaseReady) return false
        return try {
            val uploadMap = beacon.toFirestoreMap(syncedAtMs)
            FirebaseFirestore.getInstance()
                .collection("rooms")
                .document(roomId)
                .collection("beacons")
                .document(beacon.id)
                .set(uploadMap)
                .await()
            true
        } catch (e: Exception) {
            val msg = e.localizedMessage ?: "offline cached"
            _uiState.update {
                it.copy(statusBanner = "Firestore queue note: $msg")
            }
            false
        }
    }

    suspend fun flushPendingBeacons() {
        val current = _uiState.value
        val unsynced = current.beacons.filter { !it.syncedToCloud }
        if (unsynced.isEmpty()) {
            _uiState.update { it.copy(statusBanner = "Uplink Online • All Beacons Synced") }
            return
        }

        var syncedCount = 0
        val updatedMap = mutableMapOf<String, TriageBeacon>()
        for (beacon in unsynced) {
            val now = System.currentTimeMillis()
            if (syncBeaconToFirestore(beacon, current.roomId, now)) {
                updatedMap[beacon.id] = beacon.copy(syncedToCloud = true, syncedAt = now)
                syncedCount++
            }
        }

        _uiState.update { state ->
            state.copy(
                beacons = state.beacons.map { updatedMap[it.id] ?: it },
                statusBanner = if (syncedCount > 0) {
                    "Uplink Flushed $syncedCount Queued Beacon(s) → rooms/${state.roomId}/beacons"
                } else {
                    "Uplink Ready • Add app/google-services.json to enable live Cloud Sync"
                }
            )
        }
    }

    fun listenForCloudDirectives(newRoomId: String) {
        val cleanRoom = newRoomId.trim().uppercase().ifEmpty { "CASCADIA-01" }
        _uiState.update { it.copy(roomId = cleanRoom) }

        briefsListener?.remove()
        if (!isFirebaseReady) return

        briefsListener = FirebaseFirestore.getInstance()
            .collection("rooms")
            .document(cleanRoom)
            .collection("briefs")
            .orderBy("generatedAt", Query.Direction.DESCENDING)
            .limit(5)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    val msg = error.localizedMessage ?: "waiting"
                    _uiState.update {
                        it.copy(statusBanner = "Brief listener: $msg")
                    }
                    return@addSnapshotListener
                }
                val docs = snapshot?.documents ?: return@addSnapshotListener
                val briefs = docs.mapNotNull { doc ->
                    doc.data?.let { CloudIncidentBrief.fromFirestore(it) }
                }
                val latestSummary = briefs.firstOrNull()?.executiveSummary
                val allDirectives = briefs.flatMap { it.directives }

                _uiState.update {
                    it.copy(
                        latestBriefSummary = latestSummary,
                        directives = allDirectives
                    )
                }
            }
    }

    // ========================================================================
    // Bootstrap & Deterministic Zero-Network Fallbacks
    // ========================================================================

    companion object {
        private const val CLOUD_MODEL_NAME = "gemini-2.5-flash"

        @Volatile
        var isFirebaseReady: Boolean = false
            private set

        @Volatile
        var isAppCheckConfigured: Boolean = false
            private set

        /**
         * Initializes Firebase App Check (`DebugAppCheckProviderFactory` in debug,
         * `PlayIntegrityAppCheckProviderFactory` in release) and enables offline-first
         * Firestore persistent disk cache. Safely degrades to 0-Bar Local Mode if
         * `google-services.json` is not yet configured.
         */
        fun configureFirebase(context: Context) {
            if (isFirebaseReady) return
            try {
                val app = FirebaseApp.getApps(context).firstOrNull()
                    ?: FirebaseApp.initializeApp(context)

                if (app == null) {
                    isFirebaseReady = false
                    return
                }

                val appCheck = FirebaseAppCheck.getInstance()
                if (BuildConfig.DEBUG) {
                    appCheck.installAppCheckProviderFactory(
                        DebugAppCheckProviderFactory.getInstance()
                    )
                } else {
                    appCheck.installAppCheckProviderFactory(
                        PlayIntegrityAppCheckProviderFactory.getInstance()
                    )
                }
                isAppCheckConfigured = true

                val db = FirebaseFirestore.getInstance()
                val settings = FirebaseFirestoreSettings.Builder(db.firestoreSettings)
                    .setLocalCacheSettings(PersistentCacheSettings.newBuilder().build())
                    .build()
                db.firestoreSettings = settings

                isFirebaseReady = true
            } catch (_: Exception) {
                isFirebaseReady = false
            }
        }

        fun deterministicLocalPiiScrub(raw: String): Pair<String, List<String>> {
            var out = raw
            val types = linkedSetOf<String>()

            fun applyRule(regex: Regex, replacement: String, tag: String) {
                if (regex.containsMatchIn(out)) {
                    types.add(tag)
                    out = regex.replace(out, replacement)
                }
            }

            applyRule(Regex("""\b\d{3}-\d{2}-\d{4}\b"""), "[SSN_REDACTED]", "SSN")
            applyRule(Regex("""\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b"""), "[PHONE_REDACTED]", "PHONE")
            applyRule(
                Regex("""(?:Med(?:ical)?\s*ID\s*#?\s*[\w-]+)""", RegexOption.IGNORE_CASE),
                "[MED_ID]",
                "MEDICAL_ID"
            )
            applyRule(
                Regex(
                    """(my name is|soy|nurse|husband)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)""",
                    RegexOption.IGNORE_CASE
                ),
                "$1 [PERSON]",
                "PERSON_NAME"
            )
            applyRule(
                Regex("""\b(\d{2,5})\s+([A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd))\b"""),
                "[BLOCK] $2",
                "EXACT_ADDRESS"
            )

            return out to types.sorted()
        }

        /**
         * Builds non-overlapping segments of the citizen's local input so Jetpack Compose
         * can render red struck-through PII proof alongside mint replacement tags.
         */
        fun computePiiDiffSegments(raw: String): List<PiiDiffSegment> {
            data class SpanMatch(
                val start: Int,
                val end: Int,
                val replacement: String,
                val piiType: String
            )

            val matches = mutableListOf<SpanMatch>()

            Regex("""\b\d{3}-\d{2}-\d{4}\b""").findAll(raw).forEach { m ->
                matches.add(SpanMatch(m.range.first, m.range.last + 1, "[SSN_REDACTED]", "SSN"))
            }
            Regex("""\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b""").findAll(raw).forEach { m ->
                matches.add(SpanMatch(m.range.first, m.range.last + 1, "[PHONE_REDACTED]", "PHONE"))
            }
            Regex("""(?:Med(?:ical)?\s*ID\s*#?\s*[\w-]+)""", RegexOption.IGNORE_CASE)
                .findAll(raw).forEach { m ->
                    matches.add(SpanMatch(m.range.first, m.range.last + 1, "[MED_ID]", "MEDICAL_ID"))
                }
            Regex(
                """(my name is|soy|nurse|husband)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)""",
                RegexOption.IGNORE_CASE
            ).findAll(raw).forEach { m ->
                val nameGroup = m.groups[2]
                if (nameGroup != null) {
                    matches.add(
                        SpanMatch(
                            nameGroup.range.first,
                            nameGroup.range.last + 1,
                            "[PERSON]",
                            "PERSON_NAME"
                        )
                    )
                }
            }
            Regex("""\b(\d{2,5})\s+([A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd))\b""")
                .findAll(raw).forEach { m ->
                    val houseGroup = m.groups[1]
                    if (houseGroup != null) {
                        matches.add(
                            SpanMatch(
                                houseGroup.range.first,
                                houseGroup.range.last + 1,
                                "[BLOCK]",
                                "EXACT_ADDRESS"
                            )
                        )
                    }
                }

            val sorted = matches.sortedBy { it.start }
            val segments = mutableListOf<PiiDiffSegment>()
            var cursor = 0

            for (span in sorted) {
                if (span.start < cursor) continue
                if (span.start > cursor) {
                    segments.add(
                        PiiDiffSegment(
                            text = raw.substring(cursor, span.start),
                            isRedactedPii = false
                        )
                    )
                }
                segments.add(
                    PiiDiffSegment(
                        text = raw.substring(span.start, span.end),
                        isRedactedPii = true,
                        replacementTag = span.replacement,
                        piiType = span.piiType
                    )
                )
                cursor = span.end
            }
            if (cursor < raw.length) {
                segments.add(PiiDiffSegment(text = raw.substring(cursor), isRedactedPii = false))
            }
            return segments
        }

        fun deterministicLocalTriage(
            redacted: String,
            sectorLabel: String,
            categoryOverride: BeaconCategory? = null
        ): Pair<CompactBeaconPayload, List<String>> {
            val lower = redacted.lowercase()
            val med = mutableListOf<String>()
            val haz = mutableListOf<String>()
            var sev = Severity.MODERATE
            var cat = BeaconCategory.OTHER

            if ("insulin" in lower || "diabetic" in lower) {
                med.add("INSULIN_URGENT")
                sev = Severity.CRITICAL
                cat = BeaconCategory.MEDICAL
            }
            if ("oxygen" in lower || "generator" in lower) {
                med.add("OXYGEN_DEPLETION")
                sev = Severity.CRITICAL
                cat = BeaconCategory.MEDICAL
            }
            if ("bleed" in lower || "injur" in lower) {
                med.add("TRAUMA_BLEEDING")
                sev = Severity.CRITICAL
                cat = BeaconCategory.MEDICAL
            }
            if ("non-ambulatory" in lower || "trapped" in lower) {
                med.add("NON_AMBULATORY")
                sev = Severity.CRITICAL
                if (cat == BeaconCategory.OTHER) cat = BeaconCategory.TRAPPED
            }
            if ("gas" in lower || "fire" in lower || "smoke" in lower) {
                haz.add("GAS_LEAK")
                sev = Severity.CRITICAL
                if (cat == BeaconCategory.OTHER) cat = BeaconCategory.FIRE_HAZARD
            }
            if ("bridge" in lower || "ramp" in lower || "debris" in lower) {
                haz.add("ROUTE_BLOCKED")
                if (cat == BeaconCategory.OTHER) cat = BeaconCategory.INFRASTRUCTURE
            }
            if ("collapsed" in lower || "stairwell" in lower) {
                haz.add("STRUCTURAL_COLLAPSE")
            }
            if ("south approach" in lower || "pine st" in lower) {
                haz.add("ALT_ROUTE_PINE_ST_CLEAR")
            }

            if (categoryOverride != null) {
                cat = categoryOverride
            }

            var ppl = if ("husband" in lower) 2 else 1
            val countMatch = Regex(
                """\b(\d+)\s*(?:people|patients|cars|trapped|injured)\b""",
                RegexOption.IGNORE_CASE
            ).find(redacted)
            if (countMatch != null) {
                ppl = (countMatch.groupValues[1].toIntOrNull() ?: 1).coerceAtLeast(1)
            }

            val cleanSummary = redacted.replace(Regex("""\s+"""), " ").trim().take(112)

            val steps = mutableListOf<String>()
            if ("GAS_LEAK" in haz) {
                steps.add("Do NOT toggle switches or sparks; move to an upwind window away from gas fumes.")
            }
            if ("INSULIN_URGENT" in med) {
                steps.add("Keep remaining insulin cool in a damp cloth; rest flat and sip water slowly.")
            }
            if ("OXYGEN_DEPLETION" in med) {
                steps.add("Titrate stable patients to lowest safe O2 liter flow to extend reserve tanks.")
            }
            if ("TRAUMA_BLEEDING" in med) {
                steps.add("Apply firm, continuous direct pressure with clean cloth; elevate and keep warm.")
            }
            if (steps.size < 3) {
                steps.add("Dim screen & enable Battery Saver; ZeroBar will relay your <400B beacon on first contact.")
            }
            if (steps.size < 3) {
                steps.add("Signal rescuers from a safe exterior window every 5 minutes without re-entering collapse zones.")
            }

            val payload = CompactBeaconPayload(
                sev = sev,
                cat = cat,
                ppl = ppl,
                med = med,
                haz = haz,
                loc = sectorLabel,
                sum = cleanSummary
            )
            return payload to steps.take(3)
        }

        private fun extractJsonObject(rawText: String): JSONObject? {
            val cleaned = rawText
                .replace(Regex("```json", RegexOption.IGNORE_CASE), "")
                .replace("```", "")
                .trim()
            val start = cleaned.indexOf('{')
            val end = cleaned.lastIndexOf('}')
            if (start < 0 || end <= start) return null
            return try {
                JSONObject(cleaned.substring(start, end + 1))
            } catch (_: Exception) {
                null
            }
        }

        private fun parseRedactionJson(rawText: String): Pair<String, List<String>>? {
            val obj = extractJsonObject(rawText) ?: return null
            val redacted = obj.optString("redacted", "").takeIf { it.isNotBlank() } ?: return null
            val arr = obj.optJSONArray("piiTypes")
            val types = buildList {
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        val item = arr.optString(i, "").trim()
                        if (item.isNotEmpty()) add(item)
                    }
                }
            }
            return redacted to types
        }

        private fun parseTriageJson(
            rawText: String,
            fallbackRedacted: String,
            sectorLabel: String,
            categoryOverride: BeaconCategory?
        ): Pair<CompactBeaconPayload, List<String>>? {
            val obj = extractJsonObject(rawText) ?: return null
            val fallback = deterministicLocalTriage(fallbackRedacted, sectorLabel, categoryOverride)

            val sev = obj.optString("sev").takeIf { it.isNotBlank() }
                ?.let { Severity.fromWire(it) } ?: fallback.first.sev
            val cat = categoryOverride ?: obj.optString("cat").takeIf { it.isNotBlank() }
                ?.let { BeaconCategory.fromWire(it) } ?: fallback.first.cat
            val ppl = obj.optInt("ppl", fallback.first.ppl).coerceAtLeast(1)

            fun readStringList(key: String, default: List<String>): List<String> {
                val arr = obj.optJSONArray(key) ?: return default
                val list = mutableListOf<String>()
                for (i in 0 until arr.length()) {
                    val v = arr.optString(i, "").trim()
                    if (v.isNotEmpty()) list.add(v)
                }
                return if (list.isEmpty()) default else list
            }

            // Defense-in-depth: scrub summary again so SSNs can never reach Firestore rules check
            val rawSum = obj.optString("sum", fallback.first.sum).ifBlank { fallback.first.sum }
            val safeSum = deterministicLocalPiiScrub(rawSum).first

            val payload = CompactBeaconPayload(
                sev = sev,
                cat = cat,
                ppl = ppl,
                med = readStringList("med", fallback.first.med),
                haz = readStringList("haz", fallback.first.haz),
                loc = obj.optString("loc", sectorLabel).ifBlank { sectorLabel },
                sum = safeSum
            )
            val steps = readStringList("survivalSteps", fallback.second).take(3)
            return payload to steps
        }
    }
}
