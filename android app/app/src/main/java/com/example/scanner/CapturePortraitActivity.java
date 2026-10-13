package com.example.scanner;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.ImageButton;

import com.example.R;
import com.journeyapps.barcodescanner.CaptureActivity;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;

/**
 * Professional, custom-styled QR scanner activity with animated laser sweep,
 * flashlight controls, and cyberpunk glassmorphic aesthetics.
 */
public class CapturePortraitActivity extends CaptureActivity {

    private DecoratedBarcodeView barcodeView;
    private ImageButton btnTorch;
    private boolean isTorchOn = false;
    private ObjectAnimator laserAnimator;

    @Override
    protected DecoratedBarcodeView initializeContent() {
        setContentView(R.layout.activity_pro_scanner);
        barcodeView = findViewById(R.id.zxing_barcode_scanner);

        // Hide default ZXing status text & view finder to use our sleek custom reticle
        if (barcodeView != null) {
            if (barcodeView.getStatusView() != null) {
                barcodeView.getStatusView().setVisibility(View.GONE);
            }
            if (barcodeView.getViewFinder() != null) {
                barcodeView.getViewFinder().setVisibility(View.GONE);
            }
        }

        setupControls();
        setupLaserAnimation();

        return barcodeView;
    }

    private void setupControls() {
        View btnBack = findViewById(R.id.btnScannerBack);
        if (btnBack != null) {
            btnBack.setOnClickListener(v -> {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                finish();
            });
        }

        btnTorch = findViewById(R.id.btnScannerTorch);
        if (btnTorch != null) {
            boolean hasFlash = getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_FLASH);
            if (!hasFlash) {
                btnTorch.setVisibility(View.GONE);
            } else {
                updateTorchUi(false);
                btnTorch.setOnClickListener(v -> {
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    toggleTorch();
                });
            }
        }

        if (barcodeView != null) {
            barcodeView.setTorchListener(new DecoratedBarcodeView.TorchListener() {
                @Override
                public void onTorchOn() {
                    updateTorchUi(true);
                }

                @Override
                public void onTorchOff() {
                    updateTorchUi(false);
                }
            });
        }
    }

    private void toggleTorch() {
        if (barcodeView == null) return;
        if (isTorchOn) {
            barcodeView.setTorchOff();
        } else {
            barcodeView.setTorchOn();
        }
    }

    private void updateTorchUi(boolean on) {
        isTorchOn = on;
        if (btnTorch != null) {
            if (on) {
                btnTorch.setImageResource(R.drawable.ic_flashlight_on);
                btnTorch.setColorFilter(androidx.core.content.ContextCompat.getColor(this, R.color.accent_neon_cyan_bright));
                btnTorch.setBackgroundResource(R.drawable.bg_icon_button_active);
            } else {
                btnTorch.setImageResource(R.drawable.ic_flashlight_off);
                btnTorch.setColorFilter(androidx.core.content.ContextCompat.getColor(this, R.color.text_secondary));
                btnTorch.setBackgroundResource(R.drawable.bg_icon_button);
            }
        }
    }

    private void setupLaserAnimation() {
        View laserLine = findViewById(R.id.laserLine);
        View frameContainer = findViewById(R.id.scannerFrameContainer);

        if (laserLine != null && frameContainer != null) {
            frameContainer.post(() -> {
                int parentHeight = frameContainer.getHeight();
                int laserHeight = laserLine.getHeight();
                float travelDistance = Math.max(0, parentHeight - laserHeight - 16);

                laserAnimator = ObjectAnimator.ofFloat(laserLine, "translationY", 8f, travelDistance);
                laserAnimator.setDuration(1800);
                laserAnimator.setRepeatMode(ValueAnimator.REVERSE);
                laserAnimator.setRepeatCount(ValueAnimator.INFINITE);
                laserAnimator.setInterpolator(new AccelerateDecelerateInterpolator());
                laserAnimator.start();
            });
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (laserAnimator != null && laserAnimator.isPaused()) {
            laserAnimator.resume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (laserAnimator != null && laserAnimator.isRunning()) {
            laserAnimator.pause();
        }
    }

    @Override
    protected void onDestroy() {
        if (laserAnimator != null) {
            laserAnimator.cancel();
            laserAnimator = null;
        }
        super.onDestroy();
    }
}
