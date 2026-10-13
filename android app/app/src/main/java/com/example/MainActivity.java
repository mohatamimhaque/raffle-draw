package com.example;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.HapticFeedbackConstants;
import android.view.LayoutInflater;
import android.view.View;
import android.view.animation.LinearInterpolator;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.model.ConnectionState;
import com.example.remote.RemoteCommandManager;
import com.example.remote.SupabaseRealtimeManager;
import com.example.scanner.CapturePortraitActivity;
import com.example.scanner.QrCredentialParser;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;

/**
 * Ultra-minimalist, centered DRAW remote activity.
 * Contains only the central controller button and the developer name in the footer.
 * Supports both live Supabase PC synchronization and responsive standalone stage simulation.
 */
public class MainActivity extends AppCompatActivity implements RemoteCommandManager.StateListener {

    private static final String PREFS_NAME = "raffle_remote_prefs";
    private static final String KEY_SESSION_ID = "session_id";
    private static final String KEY_SUPABASE_URL = "supabase_url";
    private static final String KEY_SUPABASE_KEY = "supabase_key";

    private final ActivityResultLauncher<ScanOptions> qrScanLauncher = registerForActivityResult(
            new ScanContract(),
            result -> {
                if (result.getContents() != null) {
                    onQrCodeScanned(result.getContents());
                } else {
                    if (!hasValidCredentials()) {
                        showFeedback(getString(R.string.desc_scan_website_qr));
                    }
                }
            }
    );

    private View haloGlow;
    private LinearLayout drawCardContainer;
    private ImageView ivConnectionDot;
    private TextView tvConnectionStatus;
    private ImageView ivDrawIcon;
    private TextView tvDrawAction;
    private TextView tvDrawStatusDesc;
    private View feedbackContainer;
    private TextView tvFeedbackMessage;
    private TextView tvFooterDeveloper;

    private SupabaseRealtimeManager realtimeManager;
    private RemoteCommandManager commandManager;
    private SharedPreferences prefs;

    private ObjectAnimator rotateAnimator;
    private ObjectAnimator pulseAnimator;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable hideFeedbackRunnable = this::hideFeedback;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        setupWindowInsets();
        initViews();
        setupAnimations();
        initRemoteManagers();
        setupNetworkMonitoring();

        // Check if app has necessary credentials; if not, open scanner
        if (!hasValidCredentials()) {
            renderUnconfiguredState();
            mainHandler.postDelayed(this::launchQrScanner, 350);
        } else {
            reconnectWithCurrentConfig();
        }
    }

    private void setupWindowInsets() {
        View root = findViewById(R.id.mainRootLayout);
        if (root != null) {
            ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
                Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                v.setPadding(
                        v.getPaddingLeft(),
                        systemBars.top + (int) (16 * getResources().getDisplayMetrics().density),
                        v.getPaddingRight(),
                        systemBars.bottom + (int) (16 * getResources().getDisplayMetrics().density)
                );
                return insets;
            });
        }
    }

    private void initViews() {
        haloGlow = findViewById(R.id.haloGlow);
        drawCardContainer = findViewById(R.id.drawCardContainer);
        ivConnectionDot = findViewById(R.id.ivConnectionDot);
        tvConnectionStatus = findViewById(R.id.tvConnectionStatus);
        ivDrawIcon = findViewById(R.id.ivDrawIcon);
        tvDrawAction = findViewById(R.id.tvDrawAction);
        tvDrawStatusDesc = findViewById(R.id.tvDrawStatusDesc);
        feedbackContainer = findViewById(R.id.feedbackContainer);
        tvFeedbackMessage = findViewById(R.id.tvFeedbackMessage);
        tvFooterDeveloper = findViewById(R.id.tvFooterDeveloper);

        if (tvFooterDeveloper != null) {
            tvFooterDeveloper.setText(getString(R.string.developer_name).toLowerCase());
            // Initially red until Supabase connection is established
            tvFooterDeveloper.setTextColor(ContextCompat.getColor(this, R.color.status_red));
            // Long press on developer name opens settings / test dialog
            tvFooterDeveloper.setOnLongClickListener(v -> {
                showConfigDialog();
                return true;
            });
        }

        View root = findViewById(R.id.mainRootLayout);
        if (root != null) {
            root.setOnClickListener(v -> {
                ConnectionState s = commandManager.getCurrentState();
                if (s == ConnectionState.REMOTE_UNAVAILABLE) {
                    showFeedback("Reconnecting to Supabase...");
                    reconnectWithCurrentConfig();
                }
            });
        }

        if (drawCardContainer != null) {
            drawCardContainer.setOnClickListener(this::onDrawButtonClicked);
        }
    }

    private void setupAnimations() {
        // Fast, continuous spinning rotation for the chokka (dice) icon
        rotateAnimator = ObjectAnimator.ofFloat(ivDrawIcon, "rotation", 0f, 360f);
        rotateAnimator.setDuration(600);
        rotateAnimator.setRepeatCount(ValueAnimator.INFINITE);
        rotateAnimator.setInterpolator(new LinearInterpolator());

        // Subtle scale pulse for card during draw
        PropertyValuesHolder scaleX = PropertyValuesHolder.ofFloat("scaleX", 1.0f, 1.05f, 1.0f);
        PropertyValuesHolder scaleY = PropertyValuesHolder.ofFloat("scaleY", 1.0f, 1.05f, 1.0f);
        pulseAnimator = ObjectAnimator.ofPropertyValuesHolder(drawCardContainer, scaleX, scaleY);
        pulseAnimator.setDuration(750);
        pulseAnimator.setRepeatCount(ValueAnimator.INFINITE);
    }

    private void initRemoteManagers() {
        realtimeManager = new SupabaseRealtimeManager();
        commandManager = new RemoteCommandManager(realtimeManager);
        commandManager.setStateListener(this);
        if (hasValidCredentials()) {
            renderState(commandManager.getCurrentState(), "Connecting to Supabase...");
        } else {
            renderUnconfiguredState();
        }
    }

    public boolean hasValidCredentials() {
        String url = prefs.getString(KEY_SUPABASE_URL, "");
        String key = prefs.getString(KEY_SUPABASE_KEY, "");
        String session = prefs.getString(KEY_SESSION_ID, "raffle_remote");
        if (url == null || url.trim().isEmpty() || key == null || key.trim().isEmpty()) {
            return false;
        }
        QrCredentialParser.Credentials creds = new QrCredentialParser.Credentials(url, key, session);
        return QrCredentialParser.validateCredentials(creds).isValid;
    }

    public void launchQrScanner() {
        try {
            ScanOptions options = new ScanOptions();
            options.setPrompt(getString(R.string.prompt_scan_qr));
            options.setBeepEnabled(true);
            options.setOrientationLocked(true);
            options.setCaptureActivity(CapturePortraitActivity.class);
            qrScanLauncher.launch(options);
        } catch (Exception e) {
            Toast.makeText(this, "Camera error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void onQrCodeScanned(String rawContent) {
        QrCredentialParser.ValidationResult result = QrCredentialParser.validate(rawContent);
        if (!result.isValid || result.credentials == null) {
            String errorMsg = result.errorMessage != null ? result.errorMessage : getString(R.string.qr_scan_invalid);
            showFeedback(errorMsg);
            Toast.makeText(this, errorMsg, Toast.LENGTH_LONG).show();
            renderUnconfiguredState();
            return;
        }

        QrCredentialParser.Credentials creds = result.credentials;
        prefs.edit()
                .putString(KEY_SUPABASE_URL, creds.url)
                .putString(KEY_SUPABASE_KEY, creds.key)
                .putString(KEY_SESSION_ID, creds.channel)
                .apply();

        Toast.makeText(this, R.string.qr_scan_success, Toast.LENGTH_SHORT).show();
        showFeedback("Connected: " + creds.sessionId);
        reconnectWithCurrentConfig();
    }

    private void reconnectWithCurrentConfig() {
        if (!hasValidCredentials()) {
            renderUnconfiguredState();
            return;
        }

        String url = prefs.getString(KEY_SUPABASE_URL, "");
        String key = prefs.getString(KEY_SUPABASE_KEY, "");
        String channel = prefs.getString(KEY_SESSION_ID, "");

        realtimeManager.connect(url, key, channel);
    }

    private void onDrawButtonClicked(View v) {
        v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);

        if (!hasValidCredentials()) {
            launchQrScanner();
            return;
        }

        ConnectionState state = commandManager.getCurrentState();

        if (state != ConnectionState.DRAW_AVAILABLE) {
            // Draw button is locked/disabled
            if (!commandManager.isConnected()) {
                showFeedback("Website offline / Disconnected");
            } else if (!commandManager.isMobileRemoteEnabled()) {
                showFeedback("Remote draw disabled on PC");
            } else if (!commandManager.isNextDrawAllowed()) {
                showFeedback("Next draw locked on PC");
            } else if (state == ConnectionState.DRAWING || state == ConnectionState.REQUEST_SENT) {
                showFeedback("Draw already in progress on stage...");
            } else {
                showFeedback("Draw access not granted by PC");
            }
            return;
        }

        hideFeedback();
        boolean success = commandManager.requestDraw();
        if (!success) {
            showFeedback("Tap protected (Please wait)");
        }
    }

    @Override
    public void onStateChanged(ConnectionState newState, String message) {
        runOnUiThread(() -> {
            if (!hasValidCredentials()) {
                renderUnconfiguredState();
            } else {
                renderState(newState, message);
            }
        });
    }

    @Override
    public void onPermissionChanged(boolean mobileRemoteEnabled, boolean nextDrawAllowed, boolean drawInProgress) {
        runOnUiThread(() -> {
            if (!mobileRemoteEnabled) {
                showFeedback("PC Controller: Mobile Remote is OFF");
            } else if (!nextDrawAllowed) {
                showFeedback("PC Controller: Next Draw is locked");
            } else if (drawInProgress) {
                showFeedback("PC Controller: Draw in progress on stage");
            } else {
                hideFeedback();
            }
        });
    }

    @Override
    public void onDrawStarted(int drawNumber) {
        runOnUiThread(() -> {
            hideFeedback();
            renderState(ConnectionState.DRAWING, "Draw #" + drawNumber + " in progress");
        });
    }

    @Override
    public void onDrawCompleted(int drawNumber) {
        runOnUiThread(() -> {
            renderState(ConnectionState.WAITING_FOR_PERMISSION, "Draw #" + drawNumber + " completed");
            Toast.makeText(this, "Draw #" + drawNumber + " Completed!", Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    public void onStatusMessageReceived(String statusMsg) {
        runOnUiThread(() -> {
            if (commandManager.getCurrentState() == ConnectionState.DRAWING) {
                if (tvDrawStatusDesc != null) {
                    tvDrawStatusDesc.setText(statusMsg);
                }
            }
        });
    }

    @Override
    public void onErrorOccurred(String friendlyError) {
        runOnUiThread(() -> showFeedback(friendlyError));
    }

    private void renderState(ConnectionState state, String message) {
        stopAnimations();

        switch (state) {
            case REQUEST_SENT:
                if (haloGlow != null) {
                    haloGlow.setBackgroundResource(R.drawable.bg_halo_glow);
                    haloGlow.setVisibility(View.VISIBLE);
                }
                drawCardContainer.setBackgroundResource(R.drawable.bg_draw_button_drawing);
                drawCardContainer.setEnabled(false);
                if (ivConnectionDot != null) {
                    ivConnectionDot.setColorFilter(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                if (tvConnectionStatus != null) {
                    tvConnectionStatus.setText(R.string.status_connected_caps);
                    tvConnectionStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                if (tvFooterDeveloper != null) {
                    tvFooterDeveloper.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                ivDrawIcon.setImageResource(R.drawable.ic_casino);
                ivDrawIcon.setColorFilter(ContextCompat.getColor(this, R.color.accent_gold));
                tvDrawAction.setText(R.string.action_request_sent);
                tvDrawAction.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f);
                tvDrawAction.setTextColor(ContextCompat.getColor(this, R.color.accent_gold));
                tvDrawStatusDesc.setText(R.string.desc_please_wait);
                tvDrawStatusDesc.setTextColor(ContextCompat.getColor(this, R.color.accent_gold));
                startSpinAnimation();
                break;

            case DRAWING:
                if (haloGlow != null) {
                    haloGlow.setBackgroundResource(R.drawable.bg_halo_glow);
                    haloGlow.setVisibility(View.VISIBLE);
                }
                drawCardContainer.setBackgroundResource(R.drawable.bg_draw_button_drawing);
                drawCardContainer.setEnabled(false);
                if (ivConnectionDot != null) {
                    ivConnectionDot.setColorFilter(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                if (tvConnectionStatus != null) {
                    tvConnectionStatus.setText(R.string.status_connected_caps);
                    tvConnectionStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                if (tvFooterDeveloper != null) {
                    tvFooterDeveloper.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                ivDrawIcon.setImageResource(R.drawable.ic_casino);
                ivDrawIcon.setColorFilter(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                tvDrawAction.setText(R.string.action_drawing);
                tvDrawAction.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f);
                tvDrawAction.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                tvDrawStatusDesc.setText(message != null && !message.isEmpty() ? message : getString(R.string.desc_please_wait));
                tvDrawStatusDesc.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                startDrawingAnimations();
                break;

            case WAITING_FOR_PERMISSION:
                // Website has not given access for next draw or draw access:
                // Button is disabled, cannot press, and shows RED BORDER
                if (haloGlow != null) {
                    haloGlow.setBackgroundResource(R.drawable.bg_halo_glow_red);
                    haloGlow.setVisibility(View.VISIBLE);
                }
                drawCardContainer.setBackgroundResource(R.drawable.bg_draw_button_unavailable);
                drawCardContainer.setEnabled(false);
                drawCardContainer.setClickable(false);
                if (ivConnectionDot != null) {
                    ivConnectionDot.setColorFilter(ContextCompat.getColor(this, R.color.status_red));
                }
                if (tvConnectionStatus != null) {
                    tvConnectionStatus.setText(R.string.status_waiting_caps);
                    tvConnectionStatus.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                }
                if (tvFooterDeveloper != null) {
                    tvFooterDeveloper.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                }
                ivDrawIcon.setImageResource(R.drawable.ic_lock);
                ivDrawIcon.setColorFilter(ContextCompat.getColor(this, R.color.status_red));
                tvDrawAction.setText(R.string.action_draw_unavailable);
                tvDrawAction.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19f);
                tvDrawAction.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                if (!commandManager.isMobileRemoteEnabled()) {
                    tvDrawStatusDesc.setText(R.string.desc_remote_disabled);
                } else {
                    tvDrawStatusDesc.setText(R.string.desc_waiting_permission);
                }
                tvDrawStatusDesc.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                break;

            case CONNECTING:
                // Connecting to WebSocket / Website not yet online:
                // Button is disabled, cannot press, and shows RED BORDER
                if (haloGlow != null) {
                    haloGlow.setBackgroundResource(R.drawable.bg_halo_glow_red);
                    haloGlow.setVisibility(View.VISIBLE);
                }
                drawCardContainer.setBackgroundResource(R.drawable.bg_draw_button_disconnected);
                drawCardContainer.setEnabled(false);
                drawCardContainer.setClickable(false);
                if (ivConnectionDot != null) {
                    ivConnectionDot.setColorFilter(ContextCompat.getColor(this, R.color.status_red));
                }
                if (tvConnectionStatus != null) {
                    tvConnectionStatus.setText(R.string.status_connecting_caps);
                    tvConnectionStatus.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                }
                if (tvFooterDeveloper != null) {
                    tvFooterDeveloper.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                }
                ivDrawIcon.setImageResource(R.drawable.ic_wifi_off);
                ivDrawIcon.setColorFilter(ContextCompat.getColor(this, R.color.status_red));
                tvDrawAction.setText(R.string.action_draw_unavailable);
                tvDrawAction.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19f);
                tvDrawAction.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                tvDrawStatusDesc.setText(R.string.status_connecting_caps);
                tvDrawStatusDesc.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                break;

            case REMOTE_UNAVAILABLE:
            case CONNECTED:
                // Disconnected or Website offline:
                // Button is disabled, cannot press, and shows RED BORDER
                if (haloGlow != null) {
                    haloGlow.setBackgroundResource(R.drawable.bg_halo_glow_red);
                    haloGlow.setVisibility(View.VISIBLE);
                }
                drawCardContainer.setBackgroundResource(R.drawable.bg_draw_button_disconnected);
                drawCardContainer.setEnabled(false);
                drawCardContainer.setClickable(false);
                if (ivConnectionDot != null) {
                    ivConnectionDot.setColorFilter(ContextCompat.getColor(this, R.color.status_red));
                }
                if (tvConnectionStatus != null) {
                    tvConnectionStatus.setText(R.string.status_disconnected_caps);
                    tvConnectionStatus.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                }
                if (tvFooterDeveloper != null) {
                    tvFooterDeveloper.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                }
                ivDrawIcon.setImageResource(R.drawable.ic_wifi_off);
                ivDrawIcon.setColorFilter(ContextCompat.getColor(this, R.color.status_red));
                tvDrawAction.setText(R.string.action_draw_unavailable);
                tvDrawAction.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19f);
                tvDrawAction.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                tvDrawStatusDesc.setText(R.string.desc_website_offline);
                tvDrawStatusDesc.setTextColor(ContextCompat.getColor(this, R.color.status_red));
                break;

            case DRAW_AVAILABLE:
            default:
                // Website is online, WebSocket connected, and PC granted draw access:
                // Button is enabled, user can press, and shows CYAN BORDER
                if (haloGlow != null) {
                    haloGlow.setBackgroundResource(R.drawable.bg_halo_glow);
                    haloGlow.setVisibility(View.VISIBLE);
                }
                drawCardContainer.setBackgroundResource(R.drawable.bg_draw_button_available);
                drawCardContainer.setEnabled(true);
                drawCardContainer.setClickable(true);
                if (ivConnectionDot != null) {
                    ivConnectionDot.setColorFilter(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                if (tvConnectionStatus != null) {
                    tvConnectionStatus.setText(R.string.status_connected_caps);
                    tvConnectionStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                if (tvFooterDeveloper != null) {
                    tvFooterDeveloper.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                }
                ivDrawIcon.setImageResource(R.drawable.ic_casino);
                ivDrawIcon.setColorFilter(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                tvDrawAction.setText(R.string.action_draw);
                tvDrawAction.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f);
                tvDrawAction.setTextColor(ContextCompat.getColor(this, R.color.text_primary));
                tvDrawStatusDesc.setText(R.string.desc_ready_to_draw);
                tvDrawStatusDesc.setTextColor(ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                break;
        }
    }

    private void renderUnconfiguredState() {
        stopAnimations();
        if (haloGlow != null) {
            haloGlow.setBackgroundResource(R.drawable.bg_halo_glow_red);
            haloGlow.setVisibility(View.VISIBLE);
        }
        drawCardContainer.setBackgroundResource(R.drawable.bg_draw_button_unavailable);
        drawCardContainer.setEnabled(true);
        drawCardContainer.setClickable(true);
        if (ivConnectionDot != null) {
            ivConnectionDot.setColorFilter(ContextCompat.getColor(this, R.color.status_red));
        }
        if (tvConnectionStatus != null) {
            tvConnectionStatus.setText(R.string.status_no_credentials);
            tvConnectionStatus.setTextColor(ContextCompat.getColor(this, R.color.status_red));
        }
        if (tvFooterDeveloper != null) {
            tvFooterDeveloper.setTextColor(ContextCompat.getColor(this, R.color.status_red));
        }
        ivDrawIcon.setImageResource(R.drawable.ic_qr_code);
        ivDrawIcon.setColorFilter(ContextCompat.getColor(this, R.color.status_red));
        tvDrawAction.setText(R.string.action_scan_qr);
        tvDrawAction.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f);
        tvDrawAction.setTextColor(ContextCompat.getColor(this, R.color.status_red));
        tvDrawStatusDesc.setText(R.string.desc_scan_website_qr);
        tvDrawStatusDesc.setTextColor(ContextCompat.getColor(this, R.color.status_red));
    }

    private void startDrawingAnimations() {
        if (!rotateAnimator.isRunning()) {
            rotateAnimator.start();
        }
        if (!pulseAnimator.isRunning()) {
            pulseAnimator.start();
        }
    }

    private void startSpinAnimation() {
        if (!rotateAnimator.isRunning()) {
            rotateAnimator.start();
        }
        pulseAnimator.cancel();
        drawCardContainer.setScaleX(1.0f);
        drawCardContainer.setScaleY(1.0f);
    }

    private void stopAnimations() {
        if (rotateAnimator != null && rotateAnimator.isRunning()) {
            rotateAnimator.cancel();
            ivDrawIcon.animate().rotation(0f).setDuration(250).start();
        }
        if (pulseAnimator != null && pulseAnimator.isRunning()) {
            pulseAnimator.cancel();
            drawCardContainer.setScaleX(1.0f);
            drawCardContainer.setScaleY(1.0f);
        }
    }

    private void showFeedback(String text) {
        if (text == null || text.trim().isEmpty() ||
            text.contains("Exception") || text.contains("hostname") || text.contains("resolve host")) {
            return;
        }
        if (tvFeedbackMessage != null) {
            tvFeedbackMessage.setText(text);
        }
        if (feedbackContainer != null) {
            feedbackContainer.setVisibility(View.VISIBLE);
            mainHandler.removeCallbacks(hideFeedbackRunnable);
            mainHandler.postDelayed(hideFeedbackRunnable, 3000);
        }
    }

    private void hideFeedback() {
        if (feedbackContainer != null) {
            feedbackContainer.setVisibility(View.GONE);
        }
    }

    private void showConfigDialog() {
        View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_session_config, null);
        EditText etUrl = dialogView.findViewById(R.id.etUrlInput);
        EditText etKey = dialogView.findViewById(R.id.etKeyInput);
        EditText etSession = dialogView.findViewById(R.id.etSessionInput);
        Button btnScanQrDialog = dialogView.findViewById(R.id.btnScanQrDialog);
        Button btnClearCreds = dialogView.findViewById(R.id.btnClearCredentialsDialog);
        Button btnCancel = dialogView.findViewById(R.id.btnCancelDialog);
        Button btnSave = dialogView.findViewById(R.id.btnSaveDialog);

        String currentUrl = prefs.getString(KEY_SUPABASE_URL, "");
        String currentKey = prefs.getString(KEY_SUPABASE_KEY, "");
        String currentSession = prefs.getString(KEY_SESSION_ID, "raffle_remote");

        if (etUrl != null) etUrl.setText(currentUrl);
        if (etKey != null) etKey.setText(currentKey);
        if (etSession != null) etSession.setText(currentSession);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setView(dialogView)
                .create();

        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        }

        if (btnScanQrDialog != null) {
            btnScanQrDialog.setOnClickListener(v -> {
                dialog.dismiss();
                launchQrScanner();
            });
        }

        if (btnClearCreds != null) {
            btnClearCreds.setOnClickListener(v -> {
                prefs.edit().clear().apply();
                if (realtimeManager != null) {
                    realtimeManager.disconnect();
                }
                dialog.dismiss();
                renderUnconfiguredState();
                Toast.makeText(this, "Credentials cleared. Please scan QR.", Toast.LENGTH_SHORT).show();
            });
        }

        btnCancel.setOnClickListener(v -> dialog.dismiss());

        btnSave.setOnClickListener(v -> {
            String newUrl = etUrl != null ? etUrl.getText().toString().trim() : "";
            String newKey = etKey != null ? etKey.getText().toString().trim() : "";
            String newSession = etSession != null ? etSession.getText().toString().trim() : "";
            if (newSession.isEmpty()) {
                newSession = "raffle_remote";
            }

            prefs.edit()
                    .putString(KEY_SUPABASE_URL, newUrl)
                    .putString(KEY_SUPABASE_KEY, newKey)
                    .putString(KEY_SESSION_ID, newSession)
                    .apply();

            dialog.dismiss();
            reconnectWithCurrentConfig();
            Toast.makeText(this, "Connecting to Supabase...", Toast.LENGTH_SHORT).show();
        });

        dialog.show();
    }

    private void setupNetworkMonitoring() {
        try {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager != null) {
                NetworkRequest request = new NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build();

                networkCallback = new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(@NonNull Network network) {
                        runOnUiThread(() -> {
                            if (realtimeManager != null && !realtimeManager.isConnected() && !realtimeManager.isConnecting()) {
                                reconnectWithCurrentConfig();
                            }
                        });
                    }

                    @Override
                    public void onLost(@NonNull Network network) {
                        // Handled smoothly in background
                    }
                };
                connectivityManager.registerNetworkCallback(request, networkCallback);
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        stopAnimations();
        mainHandler.removeCallbacksAndMessages(null);
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
        }
        if (realtimeManager != null) {
            realtimeManager.disconnect();
        }
        super.onDestroy();
    }
}
