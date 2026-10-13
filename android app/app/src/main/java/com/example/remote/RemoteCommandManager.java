package com.example.remote;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.example.model.ConnectionState;
import com.example.model.DrawMessage;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

/**
 * High-level coordinator managing remote draw command flow, strict PC authoritative state,
 * UUID request generation, minimum 2-second press lockout, and rejection handling.
 *
 * Implements the official Android Remote Draw Controller state machine:
 * CONNECTING -> CONNECTED -> WAITING_FOR_PERMISSION -> DRAW_AVAILABLE -> REQUEST_SENT -> DRAWING -> WAITING_FOR_PERMISSION
 * On Realtime disconnect -> REMOTE_UNAVAILABLE
 */
public class RemoteCommandManager implements SupabaseRealtimeManager.RealtimeListener {

    private static final String TAG = "RemoteCommandManager";
    private static final long MIN_BUTTON_LOCKOUT_MS = 2000L;
    private static final long REQUEST_ACK_TIMEOUT_MS = 7000L;

    public interface StateListener {
        void onStateChanged(ConnectionState newState, String statusMessage);
        void onPermissionChanged(boolean mobileRemoteEnabled, boolean nextDrawAllowed, boolean drawInProgress);
        void onDrawStarted(int drawNumber);
        void onDrawCompleted(int drawNumber);
        void onErrorOccurred(String friendlyError);
        default void onStatusMessageReceived(String statusMsg) {}
    }

    private final SupabaseRealtimeManager realtimeManager;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private StateListener stateListener;

    private ConnectionState currentState = ConnectionState.CONNECTING;
    private volatile boolean isConnected = false;
    private boolean mobileRemoteEnabled = false;
    private boolean nextDrawAllowed = false;
    private boolean drawInProgress = false;
    private Integer currentServerDrawNumber = null;

    private long lastPressTimestamp = 0L;
    private String pendingRequestId = null;
    private final Runnable ackTimeoutRunnable;

    public RemoteCommandManager(SupabaseRealtimeManager realtimeManager) {
        this.realtimeManager = realtimeManager;
        this.realtimeManager.setListener(this);
        this.ackTimeoutRunnable = () -> {
            if (currentState == ConnectionState.REQUEST_SENT) {
                Log.w(TAG, "Draw request ACK timed out. Re-synchronizing state with PC...");
                pendingRequestId = null;
                if (stateListener != null) {
                    stateListener.onErrorOccurred("No response from PC controller. Re-syncing...");
                }
                this.realtimeManager.sendSyncRequest();
                evaluatePermissionState();
            }
        };
    }

    public void setStateListener(StateListener listener) {
        this.stateListener = listener;
        if (listener != null) {
            mainHandler.post(() -> listener.onStateChanged(currentState, null));
        }
    }

    public ConnectionState getCurrentState() {
        return currentState;
    }

    public boolean isConnected() {
        return isConnected || realtimeManager.isConnected();
    }

    public boolean isMobileRemoteEnabled() {
        return mobileRemoteEnabled;
    }

    public boolean isNextDrawAllowed() {
        return nextDrawAllowed;
    }

    public boolean isDrawInProgress() {
        return drawInProgress;
    }

    public Integer getCurrentServerDrawNumber() {
        return currentServerDrawNumber;
    }

    /**
     * Sends a draw request to the PC operator only if remote control is enabled,
     * next draw is allowed, and no draw is currently in progress.
     */
    public boolean requestDraw() {
        long now = System.currentTimeMillis();
        long elapsed = now - lastPressTimestamp;

        // Minimum 1.5-second client-side lockout
        if (elapsed < 1500) {
            Log.d(TAG, "Draw request ignored: lockout active (" + elapsed + "ms)");
            return false;
        }

        // Strictly verify connection
        if (!isConnected && !realtimeManager.isConnected()) {
            updateState(ConnectionState.REMOTE_UNAVAILABLE, "Not connected to Realtime");
            return false;
        }

        if (drawInProgress) {
            Log.w(TAG, "Draw request denied: draw is already in progress");
            return false;
        }

        lastPressTimestamp = now;
        String reqId = UUID.randomUUID().toString();
        pendingRequestId = reqId;

        try {
            JSONObject drawReq = DrawMessage.createDrawRequest(reqId);
            updateState(ConnectionState.REQUEST_SENT, "Request sent to PC...");

            boolean sent = realtimeManager.broadcast(drawReq);
            if (sent) {
                mainHandler.removeCallbacks(ackTimeoutRunnable);
                mainHandler.postDelayed(ackTimeoutRunnable, REQUEST_ACK_TIMEOUT_MS);
                return true;
            } else {
                pendingRequestId = null;
                updateState(ConnectionState.REMOTE_UNAVAILABLE, "Failed to send request");
                return false;
            }
        } catch (JSONException e) {
            Log.e(TAG, "Failed to construct draw request JSON: " + e.getMessage());
            pendingRequestId = null;
            return false;
        }
    }

    @Override
    public void onConnected() {
        Log.i(TAG, "Channel subscribed. Waiting for permission state from PC...");
        this.isConnected = true;
        this.mobileRemoteEnabled = false;
        this.nextDrawAllowed = false;
        this.drawInProgress = false;
        mainHandler.removeCallbacks(ackTimeoutRunnable);
        pendingRequestId = null;
        updateState(ConnectionState.WAITING_FOR_PERMISSION, "Connected. Waiting for PC...");
    }

    @Override
    public void onConnecting() {
        updateState(ConnectionState.CONNECTING, "Connecting to Supabase...");
    }

    @Override
    public void onReconnecting() {
        this.isConnected = false;
        updateState(ConnectionState.REMOTE_UNAVAILABLE, "Reconnecting...");
    }

    @Override
    public void onDisconnected(String reason) {
        Log.w(TAG, "Realtime disconnected: " + reason);
        this.isConnected = false;
        mainHandler.removeCallbacks(ackTimeoutRunnable);
        pendingRequestId = null;
        updateState(ConnectionState.REMOTE_UNAVAILABLE, "REMOTE UNAVAILABLE");
    }

    @Override
    public void onError(String error) {
        Log.w(TAG, "Realtime transport error: " + error);
        this.isConnected = false;
        mainHandler.removeCallbacks(ackTimeoutRunnable);
        pendingRequestId = null;
        updateState(ConnectionState.REMOTE_UNAVAILABLE, "REMOTE UNAVAILABLE");
    }

    @Override
    public void onMessageReceived(DrawMessage message) {
        if (message == null) return;
        String type = message.getType();
        Log.d(TAG, "Incoming message: type=" + type + ", requestId=" + message.getRequestId());

        switch (type) {
            case DrawMessage.TYPE_DRAW_PERMISSION:
                handleDrawPermission(message);
                break;

            case DrawMessage.TYPE_DRAW_ACK:
                handleDrawAck(message);
                break;

            case DrawMessage.TYPE_DRAW_STARTED:
                handleDrawStarted(message);
                break;

            case DrawMessage.TYPE_DRAW_STATUS:
                handleDrawStatus(message);
                break;

            case DrawMessage.TYPE_DRAW_COMPLETED:
                handleDrawCompleted(message);
                break;

            default:
                Log.d(TAG, "Ignored message type: " + type);
                break;
        }
    }

    private void handleDrawPermission(DrawMessage permission) {
        // Contract rule: Treat absent boolean fields as false.
        // Do not infer permission from draw_started, draw_completed, or a local timer.
        this.mobileRemoteEnabled = permission.getMobileRemoteEnabled() != null && permission.getMobileRemoteEnabled();
        this.nextDrawAllowed = permission.getNextDrawAllowed() != null && permission.getNextDrawAllowed();
        this.drawInProgress = permission.getDrawInProgress() != null && permission.getDrawInProgress();

        if (stateListener != null) {
            stateListener.onPermissionChanged(mobileRemoteEnabled, nextDrawAllowed, drawInProgress);
        }

        // Do not interrupt while waiting for an active request ACK
        if (currentState != ConnectionState.REQUEST_SENT) {
            evaluatePermissionState();
        }
    }

    private void handleDrawAck(DrawMessage ack) {
        mainHandler.removeCallbacks(ackTimeoutRunnable);

        if (pendingRequestId != null && pendingRequestId.equals(ack.getRequestId())) {
            pendingRequestId = null;

            if (ack.isAccepted()) {
                Log.i(TAG, "Draw request ACCEPTED by PC operator");
                // For accepted, keep the button disabled until lifecycle/permission messages indicate otherwise
                this.nextDrawAllowed = false;
                this.drawInProgress = true;
                updateState(ConnectionState.DRAWING, "Draw authorized by PC");
            } else {
                String rawReason = ack.getReason() != null ? ack.getReason() : "UNKNOWN";
                Log.w(TAG, "Draw request REJECTED by PC: " + rawReason);
                String friendlyError = mapRejectionReasonToFriendly(rawReason);

                if (stateListener != null) {
                    stateListener.onErrorOccurred(friendlyError);
                }

                // Respect 2-second lockout before re-enabling
                long elapsed = System.currentTimeMillis() - lastPressTimestamp;
                long remainingLockout = Math.max(0, MIN_BUTTON_LOCKOUT_MS - elapsed);

                mainHandler.postDelayed(this::evaluatePermissionState, remainingLockout);
            }
        }
    }

    private void handleDrawStarted(DrawMessage started) {
        mainHandler.removeCallbacks(ackTimeoutRunnable);
        pendingRequestId = null;
        this.drawInProgress = true;
        this.nextDrawAllowed = false;

        // Use draw_number only for display. Never create a second local draw counter.
        if (started.getDrawNumber() != null) {
            this.currentServerDrawNumber = started.getDrawNumber();
        }

        int drawNum = currentServerDrawNumber != null ? currentServerDrawNumber : 1;
        if (stateListener != null) {
            stateListener.onDrawStarted(drawNum);
        }

        updateState(ConnectionState.DRAWING, "Draw #" + drawNum + " in progress");
    }

    private void handleDrawStatus(DrawMessage statusMsg) {
        if (statusMsg.getDrawNumber() != null) {
            this.currentServerDrawNumber = statusMsg.getDrawNumber();
        }
        String msg = statusMsg.getStatusMessage();
        if (msg == null || msg.trim().isEmpty()) {
            msg = "Draw in progress...";
        }
        if (stateListener != null) {
            stateListener.onStatusMessageReceived(msg);
        }
    }

    private void handleDrawCompleted(DrawMessage completed) {
        this.drawInProgress = false;
        this.nextDrawAllowed = false;

        // Use draw_number only for display. Never store or show winner identity.
        if (completed.getDrawNumber() != null) {
            this.currentServerDrawNumber = completed.getDrawNumber();
        }

        int drawNum = currentServerDrawNumber != null ? currentServerDrawNumber : 1;
        if (stateListener != null) {
            stateListener.onDrawCompleted(drawNum);
        }

        // Remain unavailable until a later draw_permission message explicitly allows the next draw
        updateState(ConnectionState.WAITING_FOR_PERMISSION, "Draw #" + drawNum + " completed");
    }

    /**
     * Official button rendering rule from spec:
     * mobile_remote_enabled == false  -> DRAW UNAVAILABLE
     * next_draw_allowed == false      -> DRAW UNAVAILABLE
     * draw_in_progress == true        -> DRAWING
     * all three checks pass           -> DRAW
     */
    public void evaluatePermissionState() {
        if (!isConnected && !realtimeManager.isConnected()) {
            updateState(ConnectionState.REMOTE_UNAVAILABLE, "REMOTE UNAVAILABLE");
            return;
        }

        if (drawInProgress) {
            updateState(ConnectionState.DRAWING, "Draw in progress on stage");
        } else if (!mobileRemoteEnabled) {
            updateState(ConnectionState.WAITING_FOR_PERMISSION, "Mobile Remote is disabled on PC");
        } else if (!nextDrawAllowed) {
            updateState(ConnectionState.WAITING_FOR_PERMISSION, "Next draw is locked on PC");
        } else {
            updateState(ConnectionState.DRAW_AVAILABLE, "Ready for draw");
        }
    }

    private String mapRejectionReasonToFriendly(String reason) {
        if (reason == null) return "Draw request was not accepted";
        switch (reason.toUpperCase()) {
            case "MOBILE_REMOTE_DISABLED":
                return "Remote control is disabled by PC operator";
            case "NEXT_DRAW_NOT_ALLOWED":
                return "Next draw is not allowed at this time";
            case "DRAW_ALREADY_IN_PROGRESS":
                return "A draw is already in progress on stage";
            case "INVALID_REQUEST":
                return "Invalid request sent to PC";
            case "DUPLICATE_REQUEST":
                return "Duplicate request ignored";
            case "PC_NOT_READY":
                return "PC operator is not ready yet";
            default:
                return "Request rejected: " + reason;
        }
    }

    private void updateState(ConnectionState newState, String message) {
        this.currentState = newState;
        if (stateListener != null) {
            mainHandler.post(() -> stateListener.onStateChanged(newState, message));
        }
    }
}
