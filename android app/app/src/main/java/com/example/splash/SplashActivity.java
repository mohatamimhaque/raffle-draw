package com.example.splash;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.ImageView;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.example.MainActivity;
import com.example.R;

/**
 * Minimalist, dark, professional splash screen.
 * Strictly displays ONLY the provided event logo with a subtle fade-in.
 */
public class SplashActivity extends AppCompatActivity {

    private static final long SPLASH_DURATION_MS = 1400L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    @SuppressWarnings("deprecation")
    private final Runnable navigateRunnable = () -> {
        if (!isFinishing() && !isDestroyed()) {
            Intent intent = new Intent(SplashActivity.this, MainActivity.class);
            startActivity(intent);
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        ImageView logo = findViewById(R.id.splashLogo);
        if (logo != null) {
            logo.setAlpha(0f);
            logo.setScaleX(0.92f);
            logo.setScaleY(0.92f);

            logo.animate()
                    .alpha(1f)
                    .scaleX(1.0f)
                    .scaleY(1.0f)
                    .setDuration(700)
                    .setInterpolator(new AccelerateDecelerateInterpolator())
                    .start();
        }

        handler.postDelayed(navigateRunnable, SPLASH_DURATION_MS);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(navigateRunnable);
        super.onDestroy();
    }
}
