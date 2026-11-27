package app.zerobar.field.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AirplanemodeActive
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.SettingsEthernet
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.zerobar.field.models.BeaconCategory
import app.zerobar.field.models.FieldCrisisPreset
import app.zerobar.field.models.InferenceSource
import app.zerobar.field.models.PiiDiffSegment
import app.zerobar.field.models.TacticalDirective
import app.zerobar.field.models.TelemetryRecord
import app.zerobar.field.models.TriageBeacon
import app.zerobar.field.services.FieldNodeUiState
import app.zerobar.field.services.HybridAIEngine
import java.util.Locale

// Tactical Dark + Mint Palette
private val ObsidianBg = Color(0xFF070B12)
private val SlateCard = Color(0xFF0F1724)
private val DeepWell = Color(0xFF060A10)
private val MintPrimary = Color(0xFF10B981)
private val MintBright = Color(0xFF34D399)
private val AmberSignal = Color(0xFFF59E0B)
private val CriticalRed = Color(0xFFEF4444)
private val CyanUplink = Color(0xFF22D3EE)
private val TextMuted = Color(0xFF94A3B8)
private val CardBorder = Color(0x1FFFFFFF)

@Composable
fun FieldNodeScreen(engine: HybridAIEngine) {
    val state by engine.uiState.collectAsState()
    val context = LocalContext.current

    var sosText by rememberSaveable { mutableStateOf(FieldCrisisPreset.samples.first().rawText) }
    var showRoomDialog by rememberSaveable { mutableStateOf(false) }
    var roomDraft by rememberSaveable { mutableStateOf(state.roomId) }

    // Android SpeechRecognizer state for offline-capable Voice SOS
    var isListeningVoice by remember { mutableStateOf(false) }
    var voiceStatusNote by remember { mutableStateOf<String?>(null) }

    val speechRecognizer = remember(context) {
        if (SpeechRecognizer.isRecognitionAvailable(context)) {
            SpeechRecognizer.createSpeechRecognizer(context)
        } else {
            null
        }
    }

    DisposableEffect(speechRecognizer) {
        val listener = object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                isListeningVoice = true
                voiceStatusNote = "Listening (On-Device SpeechRecognizer Preferred)..."
            }

            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}

            override fun onEndOfSpeech() {
                isListeningVoice = false
            }

            override fun onError(error: Int) {
                isListeningVoice = false
                voiceStatusNote = "Voice capture stopped (code $error) — tap Voice to retry"
            }

            override fun onResults(results: Bundle?) {
                isListeningVoice = false
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val transcript = matches?.firstOrNull()
                if (!transcript.isNullOrBlank()) {
                    sosText = transcript
                    voiceStatusNote = "Transcribed locally (${transcript.toByteArray().size}B)"
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                if (!partial.isNullOrBlank()) {
                    sosText = partial
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        }

        speechRecognizer?.setRecognitionListener(listener)
        onDispose {
            speechRecognizer?.destroy()
        }
    }

    fun startSpeechCapture() {
        if (speechRecognizer == null) {
            voiceStatusNote = "SpeechRecognizer unavailable on this emulator image"
            return
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
        speechRecognizer.startListening(intent)
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startSpeechCapture()
        } else {
            voiceStatusNote = "Microphone permission required for hands-free Voice SOS"
        }
    }

    fun toggleVoiceSos() {
        if (isListeningVoice) {
            speechRecognizer?.stopListening()
            isListeningVoice = false
            voiceStatusNote = "Voice capture paused"
            return
        }
        val hasMicPerm = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (hasMicPerm) {
            startSpeechCapture()
        } else {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            TacticalHeaderCard(
                state = state,
                onOpenRoomDialog = {
                    roomDraft = state.roomId
                    showRoomDialog = true
                }
            )

            ZeroBarOfflineToggleCard(
                isOffline = state.isOfflineZeroBarMode,
                onToggle = { engine.setOfflineZeroBarMode(it) }
            )

            SosComposerCard(
                sosText = sosText,
                onSosTextChange = { sosText = it },
                selectedCategory = state.selectedCategoryOverride,
                onSelectCategory = { engine.setCategoryOverride(it) },
                onSelectPreset = { preset ->
                    sosText = preset.rawText
                    engine.setCategoryOverride(preset.defaultCategory)
                },
                isListeningVoice = isListeningVoice,
                voiceStatusNote = voiceStatusNote,
                onToggleVoice = ::toggleVoiceSos,
                isProcessing = state.isProcessing,
                onEmitBeacon = { engine.submitDistress(sosText) }
            )

            state.beacons.firstOrNull()?.let { latestBeacon ->
                PiiProofAndWireBeaconCard(beacon = latestBeacon)
                SurvivalStepsCard(beacon = latestBeacon)
            }

            CloudDirectivesCard(
                roomId = state.roomId,
                briefSummary = state.latestBriefSummary,
                directives = state.directives
            )

            TelemetryLogCard(records = state.telemetryLog)
        }
    }

    if (showRoomDialog) {
        AlertDialog(
            onDismissRequest = { showRoomDialog = false },
            containerColor = SlateCard,
            titleContentColor = Color.White,
            textContentColor = TextMuted,
            title = {
                Text(
                    text = "Command Room ID",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Pair with the ZeroBar Web Command Center & iOS Field Nodes over Firestore.",
                        fontSize = 13.sp
                    )
                    OutlinedTextField(
                        value = roomDraft,
                        onValueChange = { roomDraft = it },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = MintPrimary,
                            unfocusedBorderColor = CardBorder
                        )
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        engine.listenForCloudDirectives(roomDraft)
                        showRoomDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MintPrimary,
                        contentColor = ObsidianBg
                    )
                ) {
                    Text("Connect", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRoomDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            }
        )
    }
}

// ============================================================================
// 1. Tactical Header Card
// ============================================================================

@Composable
private fun TacticalHeaderCard(
    state: FieldNodeUiState,
    onOpenRoomDialog: () -> Unit
) {
    Surface(
        color = SlateCard,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MintPrimary.copy(alpha = 0.28f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.SettingsEthernet,
                            contentDescription = null,
                            tint = MintBright,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "ZEROBAR ANDROID NODE",
                            color = Color.White,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    }
                    Text(
                        text = "${state.callsign} • ${state.sectorLabel}",
                        color = TextMuted,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp
                    )
                }

                InferenceSourceBadge(source = state.lastInferenceSource)
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = Color.White.copy(alpha = 0.07f),
                    shape = CircleShape,
                    modifier = Modifier.clickable { onOpenRoomDialog() }
                ) {
                    Text(
                        text = "ROOM: ${state.roomId}",
                        color = Color.White,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }

                val shieldColor = if (state.appCheckActive) MintBright else AmberSignal
                Surface(
                    color = shieldColor.copy(alpha = 0.16f),
                    shape = CircleShape
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Shield,
                            contentDescription = null,
                            tint = shieldColor,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (state.appCheckActive) "PLAY INTEGRITY" else "APP CHECK (LOCAL)",
                            color = shieldColor,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp
                        )
                    }
                }
            }

            Text(
                text = state.statusBanner,
                color = MintBright,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp
            )
        }
    }
}

@Composable
private fun InferenceSourceBadge(source: InferenceSource) {
    val (label, color, icon) = when (source) {
        InferenceSource.ON_DEVICE -> Triple("AICORE NANO", MintBright, Icons.Default.Memory)
        InferenceSource.IN_CLOUD -> Triple("IN_CLOUD", CyanUplink, Icons.Default.CloudDone)
        InferenceSource.SANDBOX_SIM -> Triple("LOCAL_VAULT", AmberSignal, Icons.Default.Lock)
    }

    Surface(
        color = color.copy(alpha = 0.16f),
        shape = CircleShape,
        border = BorderStroke(1.dp, color.copy(alpha = 0.55f))
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(12.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = label,
                color = color,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp
            )
        }
    }
}

// ============================================================================
// 2. 0-Bar Offline Mode Toggle Card
// ============================================================================

@Composable
private fun ZeroBarOfflineToggleCard(
    isOffline: Boolean,
    onToggle: (Boolean) -> Unit
) {
    val accent = if (isOffline) AmberSignal else MintBright
    Surface(
        color = accent.copy(alpha = 0.11f),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.45f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            Icon(
                imageVector = if (isOffline) Icons.Default.AirplanemodeActive else Icons.Default.Wifi,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isOffline) "0-BAR OFFLINE MODE" else "UPLINK ONLINE (HYBRID)",
                    color = Color.White,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
                Text(
                    text = if (isOffline) {
                        "Strictly ONLY_ON_DEVICE AICore • Queuing beacons offline"
                    } else {
                        "PREFER_ON_DEVICE + Gemini 2.5 Flash • Firestore auto-sync"
                    },
                    color = TextMuted,
                    fontSize = 11.sp
                )
            }
            Switch(
                checked = isOffline,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = ObsidianBg,
                    checkedTrackColor = AmberSignal,
                    uncheckedThumbColor = ObsidianBg,
                    uncheckedTrackColor = MintPrimary
                )
            )
        }
    }
}

// ============================================================================
// 3. Citizen SOS Composer (Category Chips + Voice SOS + Presets)
// ============================================================================

@Composable
private fun SosComposerCard(
    sosText: String,
    onSosTextChange: (String) -> Unit,
    selectedCategory: BeaconCategory?,
    onSelectCategory: (BeaconCategory?) -> Unit,
    onSelectPreset: (FieldCrisisPreset) -> Unit,
    isListeningVoice: Boolean,
    voiceStatusNote: String?,
    onToggleVoice: () -> Unit,
    isProcessing: Boolean,
    onEmitBeacon: () -> Unit
) {
    Surface(
        color = SlateCard,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, CardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = null,
                    tint = CriticalRed,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "CITIZEN SOS INPUT",
                    color = CriticalRed,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = "${sosText.toByteArray(Charsets.UTF_8).size}B RAW",
                    color = TextMuted,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.sp
                )
            }

            // Distress Category Chips
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(vertical = 2.dp)
            ) {
                items(BeaconCategory.entries) { category ->
                    val isSelected = selectedCategory == category
                    FilterChip(
                        selected = isSelected,
                        onClick = { onSelectCategory(category) },
                        label = {
                            Text(
                                text = category.chipLabel,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            containerColor = DeepWell,
                            labelColor = TextMuted,
                            selectedContainerColor = MintPrimary.copy(alpha = 0.22f),
                            selectedLabelColor = MintBright
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = isSelected,
                            borderColor = CardBorder,
                            selectedBorderColor = MintPrimary
                        )
                    )
                }
            }

            // 1-Tap Crisis Demo Scenarios
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(FieldCrisisPreset.samples) { preset ->
                    Surface(
                        color = Color.White.copy(alpha = 0.06f),
                        shape = CircleShape,
                        border = BorderStroke(1.dp, CardBorder),
                        modifier = Modifier.clickable { onSelectPreset(preset) }
                    ) {
                        Text(
                            text = "⚡ ${preset.label}",
                            color = Color.White,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        )
                    }
                }
            }

            OutlinedTextField(
                value = sosText,
                onValueChange = onSosTextChange,
                minLines = 4,
                maxLines = 6,
                modifier = Modifier.fillMaxWidth(),
                textStyle = androidx.compose.ui.text.TextStyle(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                    color = Color.White,
                    lineHeight = 18.sp
                ),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = DeepWell,
                    unfocusedContainerColor = DeepWell,
                    focusedBorderColor = MintPrimary,
                    unfocusedBorderColor = CardBorder,
                    cursorColor = MintBright
                )
            )

            if (!voiceStatusNote.isNullOrBlank()) {
                Text(
                    text = voiceStatusNote,
                    color = MintBright,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedButton(
                    onClick = onToggleVoice,
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(
                        1.dp,
                        if (isListeningVoice) CriticalRed else MintPrimary.copy(alpha = 0.5f)
                    ),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (isListeningVoice) {
                            CriticalRed.copy(alpha = 0.2f)
                        } else {
                            DeepWell
                        },
                        contentColor = Color.White
                    ),
                    modifier = Modifier.height(48.dp)
                ) {
                    Icon(
                        imageVector = if (isListeningVoice) Icons.Default.Stop else Icons.Default.Mic,
                        contentDescription = "Voice SOS",
                        tint = if (isListeningVoice) CriticalRed else MintBright,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isListeningVoice) "STOP" else "VOICE",
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }

                Button(
                    onClick = onEmitBeacon,
                    enabled = !isProcessing && sosText.isNotBlank(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MintPrimary,
                        contentColor = ObsidianBg,
                        disabledContainerColor = MintPrimary.copy(alpha = 0.35f),
                        disabledContentColor = ObsidianBg.copy(alpha = 0.7f)
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                ) {
                    if (isProcessing) {
                        CircularProgressIndicator(
                            color = ObsidianBg,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp)
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Bolt,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isProcessing) "SCRUBBING..." else "EMIT <400B BEACON",
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

// ============================================================================
// 4. Struck-Through PII Proof & <400B Wire Beacon Card
// ============================================================================

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PiiProofAndWireBeaconCard(beacon: TriageBeacon) {
    Surface(
        color = SlateCard,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MintPrimary.copy(alpha = 0.45f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = null,
                    tint = MintBright,
                    modifier = Modifier.size(15.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "ON-DEVICE PII VAULT & WIRE PROOF",
                    color = MintBright,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = "${beacon.rawBytes}B → ${beacon.beaconBytes}B",
                    color = AmberSignal,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
            }

            if (beacon.piiRedactedTypes.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    beacon.piiRedactedTypes.forEach { tag ->
                        Surface(
                            color = MintPrimary.copy(alpha = 0.18f),
                            shape = CircleShape
                        ) {
                            Text(
                                text = "✓ $tag SCRUBBED",
                                color = MintBright,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }
                }
            }

            // Struck-through local PII redaction visual diff
            if (beacon.localPiiDiffSegments.isNotEmpty()) {
                Surface(
                    color = DeepWell,
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, CriticalRed.copy(alpha = 0.28f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "LOCAL RAM REDACTION DIFF (NEVER TRANSMITTED):",
                            color = TextMuted,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp
                        )
                        Text(
                            text = buildStruckThroughPiiString(beacon.localPiiDiffSegments),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            lineHeight = 17.sp
                        )
                    }
                }
            }

            // Sanitized <400B CompactBeaconPayload card
            Surface(
                color = DeepWell,
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(1.dp, MintPrimary.copy(alpha = 0.25f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            color = CriticalRed.copy(alpha = 0.22f),
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text(
                                text = beacon.payload.sev.wireValue,
                                color = CriticalRed,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Black,
                                fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "${beacon.payload.cat.wireValue} • ${beacon.payload.ppl} PPL",
                            color = Color.White,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 11.sp
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        Text(
                            text = if (beacon.syncedToCloud) "SYNCED CLOUD" else "QUEUED 0-BAR",
                            color = if (beacon.syncedToCloud) CyanUplink else AmberSignal,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp
                        )
                    }

                    Text(
                        text = beacon.payload.sum,
                        color = Color.White.copy(alpha = 0.92f),
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp
                    )
                }
            }

            Text(
                text = "Privacy Invariant: @get:Exclude + toFirestoreMap() guarantee raw citizen input never leaves Android RAM.",
                color = TextMuted,
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp
            )
        }
    }
}

private fun buildStruckThroughPiiString(segments: List<PiiDiffSegment>) = buildAnnotatedString {
    segments.forEach { seg ->
        if (seg.isRedactedPii) {
            withStyle(
                SpanStyle(
                    color = CriticalRed,
                    textDecoration = TextDecoration.LineThrough,
                    background = CriticalRed.copy(alpha = 0.16f)
                )
            ) {
                append(seg.text)
            }
            if (!seg.replacementTag.isNullOrBlank()) {
                append(" ")
                withStyle(
                    SpanStyle(
                        color = MintBright,
                        fontWeight = FontWeight.Bold,
                        background = MintPrimary.copy(alpha = 0.18f)
                    )
                ) {
                    append(seg.replacementTag)
                }
            }
        } else {
            withStyle(SpanStyle(color = Color.White.copy(alpha = 0.85f))) {
                append(seg.text)
            }
        }
    }
}

// ============================================================================
// 5. Instant Offline Survival Steps Card
// ============================================================================

@Composable
private fun SurvivalStepsCard(beacon: TriageBeacon) {
    Surface(
        color = SlateCard,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, AmberSignal.copy(alpha = 0.42f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.MedicalServices,
                    contentDescription = null,
                    tint = AmberSignal,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "INSTANT OFFLINE SURVIVAL STEPS",
                    color = AmberSignal,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
            }

            beacon.localSurvivalSteps.forEachIndexed { idx, step ->
                Row(
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        color = AmberSignal.copy(alpha = 0.22f),
                        shape = CircleShape,
                        modifier = Modifier.size(22.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = "${idx + 1}",
                                color = AmberSignal,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Black,
                                fontSize = 11.sp
                            )
                        }
                    }
                    Text(
                        text = step,
                        color = Color.White,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

// ============================================================================
// 6. Cloud HQ Relay Directives List
// ============================================================================

@Composable
private fun CloudDirectivesCard(
    roomId: String,
    briefSummary: String?,
    directives: List<TacticalDirective>
) {
    Surface(
        color = SlateCard,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, CyanUplink.copy(alpha = 0.32f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.Default.ArrowDownward,
                    contentDescription = null,
                    tint = CyanUplink,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "CLOUD HQ RELAY DIRECTIVES",
                    color = CyanUplink,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.weight(1f))
                Surface(
                    color = CyanUplink.copy(alpha = 0.18f),
                    shape = CircleShape
                ) {
                    Text(
                        text = "${directives.size}",
                        color = CyanUplink,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            }

            if (!briefSummary.isNullOrBlank()) {
                Surface(
                    color = CyanUplink.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = briefSummary,
                        color = Color.White.copy(alpha = 0.9f),
                        fontSize = 12.sp,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }

            if (directives.isEmpty()) {
                Text(
                    text = "Subscribed to rooms/$roomId/briefs. Trigger Cloud Swarm Commander on the Web Command Center to stream <1KB tactical directives here.",
                    color = TextMuted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp
                )
            } else {
                directives.forEach { directive ->
                    Surface(
                        color = DeepWell,
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, CardBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = MintBright,
                                    modifier = Modifier.size(13.dp)
                                )
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(
                                    text = "TO: ${directive.targetCallsign}",
                                    color = CyanUplink,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 11.sp
                                )
                                Spacer(modifier = Modifier.weight(1f))
                                Text(
                                    text = "${directive.bytes}B",
                                    color = TextMuted,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 10.sp
                                )
                            }
                            Text(
                                text = directive.message,
                                color = Color.White,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// 7. Live Hybrid AI Telemetry Strip
// ============================================================================

@Composable
private fun TelemetryLogCard(records: List<TelemetryRecord>) {
    Surface(
        color = SlateCard,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, CardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "HYBRID AI TELEMETRY (AICORE + GEMINI)",
                color = TextMuted,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp
            )

            if (records.isEmpty()) {
                Text(
                    text = "Emit a beacon to log ONLY_ON_DEVICE vs PREFER_ON_DEVICE latency & inferenceSource.",
                    color = TextMuted,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp
                )
            } else {
                records.take(4).forEach { rec ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = rec.operation.wireValue,
                            color = Color.White,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            text = rec.modeConfigured.wireValue,
                            color = TextMuted,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 9.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = rec.inferenceSource.wireValue,
                            color = if (rec.inferenceSource == InferenceSource.IN_CLOUD) {
                                CyanUplink
                            } else {
                                MintBright
                            },
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "${rec.latencyMs}ms",
                            color = AmberSignal,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 10.sp
                        )
                    }
                }
            }
        }
    }
}
