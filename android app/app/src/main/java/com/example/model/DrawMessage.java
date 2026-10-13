package com.example.model;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

/**
 * Message protocol parser and builder for PC Authoritative Raffle Remote.
 * Complies with the official Android Remote Draw Controller specification:
 * - PC to Android: draw_permission, draw_ack, draw_started, draw_completed
 * - Android to PC: sync_request, draw_request
 */
public class DrawMessage {

    public static final String TYPE_DRAW_REQUEST = "draw_request";
    public static final String TYPE_DRAW_ACK = "draw_ack";
    public static final String TYPE_DRAW_PERMISSION = "draw_permission";
    public static final String TYPE_DRAW_STARTED = "draw_started";
    public static final String TYPE_DRAW_COMPLETED = "draw_completed";
    public static final String TYPE_DRAW_STATUS = "draw_status";
    public static final String TYPE_SYNC_REQUEST = "sync_request";

    public static final String STATUS_ACCEPTED = "accepted";
    public static final String STATUS_REJECTED = "rejected";

    private final String type;
    private final String requestId;
    private final String status;
    private final String reason;
    private final Boolean mobileRemoteEnabled;
    private final Boolean nextDrawAllowed;
    private final Boolean drawInProgress;
    private final Boolean deviceConnected;
    private final Integer drawNumber;
    private final String statusMessage;

    public DrawMessage(String type, String requestId, String status, String reason,
                       Boolean mobileRemoteEnabled, Boolean nextDrawAllowed,
                       Boolean drawInProgress, Boolean deviceConnected, Integer drawNumber,
                       String statusMessage) {
        this.type = type;
        this.requestId = requestId;
        this.status = status;
        this.reason = reason;
        this.mobileRemoteEnabled = mobileRemoteEnabled;
        this.nextDrawAllowed = nextDrawAllowed;
        this.drawInProgress = drawInProgress;
        this.deviceConnected = deviceConnected;
        this.drawNumber = drawNumber;
        this.statusMessage = statusMessage;
    }

    public DrawMessage(String type, String requestId, String status, String reason,
                       Boolean mobileRemoteEnabled, Boolean nextDrawAllowed,
                       Boolean drawInProgress, Boolean deviceConnected, Integer drawNumber) {
        this(type, requestId, status, reason, mobileRemoteEnabled, nextDrawAllowed,
             drawInProgress, deviceConnected, drawNumber, null);
    }

    /**
     * Outgoing draw request with a fresh UUID and timestamp as specified by contract.
     */
    public static JSONObject createDrawRequest(String requestId) throws JSONException {
        JSONObject obj = new JSONObject();
        String id = requestId != null ? requestId : UUID.randomUUID().toString();
        obj.put("type", TYPE_DRAW_REQUEST);
        obj.put("request_id", id);
        obj.put("timestamp", System.currentTimeMillis());
        return obj;
    }

    /**
     * Outgoing sync request sent immediately after subscription or reconnection.
     */
    public static JSONObject createSyncRequest() throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put("type", TYPE_SYNC_REQUEST);
        return obj;
    }

    public static DrawMessage fromJson(JSONObject json) {
        if (json == null) return null;

        String type = json.optString("type", "");
        if (type.isEmpty()) {
            type = json.optString("event", "");
        }
        if (type.isEmpty()) {
            type = json.optString("action", "");
        }

        // Normalize type names
        String lowerType = type.trim().toLowerCase();
        if (lowerType.equals("draw_permission") || lowerType.equals("permission")) {
            type = TYPE_DRAW_PERMISSION;
        } else if (lowerType.equals("draw_ack") || lowerType.equals("ack")) {
            type = TYPE_DRAW_ACK;
        } else if (lowerType.equals("draw_started") || lowerType.equals("start") || lowerType.equals("started")) {
            type = TYPE_DRAW_STARTED;
        } else if (lowerType.equals("draw_completed") || lowerType.equals("complete") || lowerType.equals("completed")) {
            type = TYPE_DRAW_COMPLETED;
        } else if (lowerType.equals("draw_status") || lowerType.equals("status")) {
            type = TYPE_DRAW_STATUS;
        } else if (lowerType.equals("draw_request") || lowerType.equals("draw") || lowerType.equals("trigger_draw")) {
            type = TYPE_DRAW_REQUEST;
        } else if (lowerType.equals("sync_request") || lowerType.equals("sync")) {
            type = TYPE_SYNC_REQUEST;
        }

        String requestId = json.has("request_id") ? json.optString("request_id") : null;
        if (requestId == null && json.has("requestId")) {
            requestId = json.optString("requestId");
        }

        String status = json.has("status") ? json.optString("status") : null;
        String reason = json.has("reason") ? json.optString("reason") : null;
        String statusMessage = json.has("message") ? json.optString("message") : null;

        Boolean mobileRemoteEnabled = null;
        if (json.has("mobile_remote_enabled")) {
            mobileRemoteEnabled = Boolean.valueOf(json.optBoolean("mobile_remote_enabled"));
        } else if (json.has("mobileRemoteEnabled")) {
            mobileRemoteEnabled = Boolean.valueOf(json.optBoolean("mobileRemoteEnabled"));
        }

        Boolean nextDrawAllowed = null;
        if (json.has("next_draw_allowed")) {
            nextDrawAllowed = Boolean.valueOf(json.optBoolean("next_draw_allowed"));
        } else if (json.has("nextDrawAllowed")) {
            nextDrawAllowed = Boolean.valueOf(json.optBoolean("nextDrawAllowed"));
        }

        Boolean drawInProgress = null;
        if (json.has("draw_in_progress")) {
            drawInProgress = Boolean.valueOf(json.optBoolean("draw_in_progress"));
        } else if (json.has("drawInProgress")) {
            drawInProgress = Boolean.valueOf(json.optBoolean("drawInProgress"));
        }

        Boolean deviceConnected = null;
        if (json.has("device_connected")) {
            deviceConnected = Boolean.valueOf(json.optBoolean("device_connected"));
        } else if (json.has("deviceConnected")) {
            deviceConnected = Boolean.valueOf(json.optBoolean("deviceConnected"));
        }

        Integer drawNumber = null;
        if (json.has("draw_number")) {
            drawNumber = Integer.valueOf(json.optInt("draw_number"));
        } else if (json.has("drawNumber")) {
            drawNumber = Integer.valueOf(json.optInt("drawNumber"));
        }

        return new DrawMessage(type, requestId, status, reason,
                mobileRemoteEnabled, nextDrawAllowed, drawInProgress, deviceConnected, drawNumber, statusMessage);
    }

    public String getType() {
        return type;
    }

    public String getRequestId() {
        return requestId;
    }

    public String getStatus() {
        return status;
    }

    public String getReason() {
        return reason;
    }

    public String getStatusMessage() {
        return statusMessage;
    }

    public Boolean getMobileRemoteEnabled() {
        return mobileRemoteEnabled;
    }

    public Boolean getNextDrawAllowed() {
        return nextDrawAllowed;
    }

    public Boolean getDrawInProgress() {
        return drawInProgress;
    }

    public Boolean getDeviceConnected() {
        return deviceConnected;
    }

    public Integer getDrawNumber() {
        return drawNumber;
    }

    public boolean isAccepted() {
        return STATUS_ACCEPTED.equalsIgnoreCase(status);
    }

    public boolean isRejected() {
        return STATUS_REJECTED.equalsIgnoreCase(status);
    }
}
