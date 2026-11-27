package app.zerobar.field

import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.viewmodel.compose.viewModel
import app.zerobar.field.services.HybridAIEngine
import app.zerobar.field.ui.FieldNodeScreen

private val ZeroBarDarkMintScheme = darkColorScheme(
    primary = Color(0xFF10B981),
    onPrimary = Color(0xFF070B12),
    secondary = Color(0xFF34D399),
    tertiary = Color(0xFFF59E0B),
    background = Color(0xFF070B12),
    surface = Color(0xFF0F1724),
    error = Color(0xFFEF4444)
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Firebase App Check (Debug / Play Integrity) + Offline Firestore Cache
        HybridAIEngine.configureFirebase(applicationContext)

        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT)
        )

        setContent {
            MaterialTheme(colorScheme = ZeroBarDarkMintScheme) {
                val engine: HybridAIEngine = viewModel()
                FieldNodeScreen(engine = engine)
            }
        }
    }
}
