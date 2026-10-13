package com.example.model;

/**
 * Visual and operational states for the Android Remote Draw Controller:
 * CONNECTING -> CONNECTED -> WAITING_FOR_PERMISSION -> DRAW_AVAILABLE -> REQUEST_SENT -> DRAWING -> WAITING_FOR_PERMISSION
 * Disconnect: REMOTE_UNAVAILABLE
 */
public enum ConnectionState {
    CONNECTING,
    CONNECTED,
    WAITING_FOR_PERMISSION,
    DRAW_AVAILABLE,
    REQUEST_SENT,
    DRAWING,
    REMOTE_UNAVAILABLE
}
