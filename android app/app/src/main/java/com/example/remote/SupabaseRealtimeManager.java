package com.example.remote;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.example.model.DrawMessage;

import org.json.JSONException;
import org.json.JSONObject;

import java.net.UnknownHostException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Manages the Supabase Realtime Broadcast WebSocket transport.
 * Communicates using Phoenix Channels protocol over WebSockets.
 * Handles graceful offline fallback and backoff for unresolved hostnames.
 */
public class SupabaseRealtimeManager {

    private static final String TAG = "SupabaseRealtime";

    public interface RealtimeListener {
        void onConnected();
        void onConnecting();
        void onReconnecting();
        void onDisconnected(String reason);
        void onMessageReceived(DrawMessage message);
        void onError(String error);
    }

    private final OkHttpClient httpClient;
    private final Handler mainHandler;
    private final AtomicInteger refCounter = new AtomicInteger(1);

    private WebSocket webSocket;
    private RealtimeListener listener;
    private String supabaseUrl;
    private String supabaseAnonKey;
    private String channelName;
    private String rawSessionName;

    private volatile boolean isConnecting = false;
    private volatile boolean isChannelJoined = false;
    private volatile boolean isExplicitlyClosed = false;
    private int reconnectAttempts = 0;

    private final Runnable heartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            sendHeartbeat();
            mainHandler.postDelayed(this, 25000);
        }
    };

    private final Runnable reconnectRunnable = () -> {
        if (!isExplicitlyClosed && !isChannelJoined && !isConnecting) {
            startConnecting();
        }
    };

    public SupabaseRealtimeManager() {
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.httpClient = new OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(20, TimeUnit.SECONDS)
                .build();
    }

    public void setListener(RealtimeListener listener) {
        this.listener = listener;
    }

    public synchronized void connect(String supabaseUrl, String supabaseAnonKey, String sessionIdentifier) {
        if (supabaseUrl == null || supabaseUrl.trim().isEmpty()) {
            Log.d(TAG, "No Supabase URL provided; staying in standalone offline mode");
            return;
        }

        this.supabaseUrl = supabaseUrl.trim();
        this.supabaseAnonKey = supabaseAnonKey != null ? supabaseAnonKey.trim() : "";
        String cleanChannel = (sessionIdentifier != null && !sessionIdentifier.trim().isEmpty()) ?
                sessionIdentifier.trim() : "";
        if (cleanChannel.isEmpty()) {
            Log.e(TAG, "Cannot connect without channel or session identifier");
            return;
        }
        this.channelName = cleanChannel.startsWith("raffle_remote:") ? cleanChannel : "raffle_remote:" + cleanChannel;
        this.rawSessionName = this.channelName.substring("raffle_remote:".length());
        disconnect();
        this.isExplicitlyClosed = false;
        startConnecting();
    }

    private synchronized void startConnecting() {
        if (isConnecting || isChannelJoined || isExplicitlyClosed) {
            return;
        }

        isConnecting = true;

        if (listener != null) {
            if (reconnectAttempts > 0) {
                mainHandler.post(() -> listener.onReconnecting());
            } else {
                mainHandler.post(() -> listener.onConnecting());
            }
        }

        String wsUrl = buildWebSocketUrl(supabaseUrl, supabaseAnonKey);
        Log.d(TAG, "Connecting to realtime channel: " + channelName);

        Request.Builder reqBuilder = new Request.Builder().url(wsUrl);
        if (supabaseAnonKey != null && !supabaseAnonKey.isEmpty()) {
            reqBuilder.addHeader("apikey", supabaseAnonKey);
            reqBuilder.addHeader("Authorization", "Bearer " + supabaseAnonKey);
        }
        Request request = reqBuilder.build();

        webSocket = httpClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket socket, Response response) {
                Log.i(TAG, "WebSocket transport opened. Joining channels...");
                isConnecting = false;
                reconnectAttempts = 0;
                mainHandler.post(heartbeatRunnable);
                joinChannels();
            }

            @Override
            public void onMessage(WebSocket socket, String text) {
                handleIncomingRawMessage(text);
            }

            @Override
            public void onClosing(WebSocket socket, int code, String reason) {
                Log.d(TAG, "WebSocket closing: " + code + " - " + reason);
            }

            @Override
            public void onClosed(WebSocket socket, int code, String reason) {
                Log.d(TAG, "WebSocket closed: " + code + " - " + reason);
                isConnecting = false;
                isChannelJoined = false;
                mainHandler.removeCallbacks(heartbeatRunnable);
                if (listener != null) {
                    mainHandler.post(() -> listener.onDisconnected(reason));
                }
                if (!isExplicitlyClosed) {
                    scheduleReconnect(false);
                }
            }

            @Override
            public void onFailure(WebSocket socket, Throwable t, Response response) {
                isConnecting = false;
                isChannelJoined = false;
                mainHandler.removeCallbacks(heartbeatRunnable);

                boolean isUnresolvable = t instanceof UnknownHostException ||
                        (t.getMessage() != null && t.getMessage().toLowerCase().contains("unable to resolve host"));

                if (isUnresolvable) {
                    Log.w(TAG, "Realtime server host unresolvable. Operating in standby reconnect mode.");
                } else {
                    Log.w(TAG, "Realtime transport failure: " + (t.getMessage() != null ? t.getMessage() : "Offline"));
                }

                if (listener != null) {
                    mainHandler.post(() -> listener.onDisconnected(t.getMessage()));
                }

                if (!isExplicitlyClosed) {
                    scheduleReconnect(isUnresolvable);
                }
            }
        });
    }

    private String buildWebSocketUrl(String url, String anonKey) {
        if (url == null || url.trim().isEmpty()) {
            throw new IllegalArgumentException("Supabase URL cannot be empty");
        }
        String base = url.trim();
        if (base.startsWith("https://")) {
            base = "wss://" + base.substring("https://".length());
        } else if (base.startsWith("http://")) {
            base = "ws://" + base.substring("http://".length());
        } else if (!base.startsWith("wss://") && !base.startsWith("ws://")) {
            base = "wss://" + base;
        }

        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }

        String key = anonKey != null ? anonKey.trim() : "";
        return base + "/realtime/v1/websocket?apikey=" + key + "&vsn=1.0.0";
    }

    private void joinChannels() {
        // Contract requirement: Join only the exact QR-provided channel
        joinSingleChannel(channelName);
    }

    private void joinSingleChannel(String name) {
        try {
            int ref = refCounter.incrementAndGet();
            JSONObject joinMsg = new JSONObject();
            joinMsg.put("topic", "realtime:" + name);
            joinMsg.put("event", "phx_join");
            joinMsg.put("ref", String.valueOf(ref));

            JSONObject payload = new JSONObject();
            JSONObject config = new JSONObject();
            JSONObject broadcast = new JSONObject();
            broadcast.put("ack", false);
            broadcast.put("self", false);
            config.put("broadcast", broadcast);
            payload.put("config", config);
            joinMsg.put("payload", payload);

            sendRaw(joinMsg.toString());
        } catch (JSONException e) {
            Log.w(TAG, "Failed to create phx_join message: " + e.getMessage());
        }
    }

    private void sendHeartbeat() {
        if (webSocket == null || !isChannelJoined) return;
        try {
            int ref = refCounter.incrementAndGet();
            JSONObject heartbeat = new JSONObject();
            heartbeat.put("topic", "phoenix");
            heartbeat.put("event", "heartbeat");
            heartbeat.put("payload", new JSONObject());
            heartbeat.put("ref", String.valueOf(ref));
            sendRaw(heartbeat.toString());
        } catch (JSONException e) {
            Log.w(TAG, "Heartbeat JSON error: " + e.getMessage());
        }
    }

    public boolean broadcast(JSONObject innerPayload) {
        if (webSocket == null || !isChannelJoined) {
            Log.d(TAG, "Cannot broadcast: channel not joined or offline");
            return false;
        }

        // Contract requirement: Send message Broadcast envelope to exact channel
        return broadcastToTopic("realtime:" + channelName, "message", innerPayload);
    }

    private boolean broadcastToTopic(String topic, String event, JSONObject innerPayload) {
        try {
            int ref = refCounter.incrementAndGet();
            JSONObject broadcastEnvelope = new JSONObject();
            broadcastEnvelope.put("topic", topic);
            broadcastEnvelope.put("event", "broadcast");
            broadcastEnvelope.put("ref", String.valueOf(ref));

            JSONObject payloadWrapper = new JSONObject();
            payloadWrapper.put("type", "broadcast");
            payloadWrapper.put("event", event);
            payloadWrapper.put("payload", innerPayload);

            broadcastEnvelope.put("payload", payloadWrapper);
            return sendRaw(broadcastEnvelope.toString());
        } catch (JSONException e) {
            Log.w(TAG, "Failed to create broadcast envelope: " + e.getMessage());
            return false;
        }
    }

    private boolean sendRaw(String text) {
        if (webSocket != null) {
            return webSocket.send(text);
        }
        return false;
    }

    private void handleIncomingRawMessage(String raw) {
        try {
            JSONObject msg = new JSONObject(raw);
            String event = msg.optString("event", "");
            String topic = msg.optString("topic", "");

            if ("phx_reply".equals(event)) {
                JSONObject payload = msg.optJSONObject("payload");
                String status = payload != null ? payload.optString("status") : "";
                if ("ok".equals(status) && topic.startsWith("realtime:")) {
                    Log.i(TAG, "Successfully joined Realtime channel: " + topic);
                    if (!isChannelJoined) {
                        isChannelJoined = true;
                        if (listener != null) {
                            mainHandler.post(() -> listener.onConnected());
                        }
                        sendSyncRequest();
                    }
                }
                return;
            }

            if ("broadcast".equals(event)) {
                JSONObject payloadObj = msg.optJSONObject("payload");
                if (payloadObj != null) {
                    String subEvent = payloadObj.optString("event", "");
                    // Contract requirement:
                    // "Android should subscribe to the message event only.
                    // Do not subscribe to both message and named events, because the same
                    // logical message may then be processed twice."
                    JSONObject inner = payloadObj.optJSONObject("payload");
                    if (inner == null) {
                        inner = payloadObj;
                    }
                    if ("message".equals(subEvent) || (subEvent.isEmpty() && inner.has("type"))) {
                        DrawMessage drawMsg = DrawMessage.fromJson(inner);
                        if (drawMsg != null && listener != null) {
                            mainHandler.post(() -> listener.onMessageReceived(drawMsg));
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Error parsing incoming realtime message: " + e.getMessage());
        }
    }

    public void sendSyncRequest() {
        try {
            JSONObject sync = DrawMessage.createSyncRequest();
            broadcast(sync);
        } catch (JSONException e) {
            Log.w(TAG, "Failed to send sync request: " + e.getMessage());
        }
    }

    private void scheduleReconnect(boolean isHostUnresolvable) {
        reconnectAttempts++;
        long delay;
        if (isHostUnresolvable) {
            // Unresolvable domain/offline - backoff to 45 seconds to avoid battery & log noise
            delay = 45000L;
        } else {
            delay = Math.min(2000L * (1L << Math.min(reconnectAttempts, 4)), 20000L);
        }
        Log.d(TAG, "Scheduling reconnect attempt in " + delay + "ms");

        if (listener != null) {
            mainHandler.post(() -> listener.onReconnecting());
        }

        mainHandler.removeCallbacks(reconnectRunnable);
        mainHandler.postDelayed(reconnectRunnable, delay);
    }

    public synchronized void disconnect() {
        isExplicitlyClosed = true;
        isConnecting = false;
        isChannelJoined = false;
        mainHandler.removeCallbacks(heartbeatRunnable);
        mainHandler.removeCallbacks(reconnectRunnable);

        if (webSocket != null) {
            try {
                webSocket.cancel();
            } catch (Exception ignored) {}
            webSocket = null;
        }
    }

    public boolean isConnected() {
        return isChannelJoined;
    }

    public boolean isConnecting() {
        return isConnecting;
    }

    public String getChannelName() {
        return channelName;
    }
}
