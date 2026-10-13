package com.example

import com.example.model.ConnectionState
import com.example.model.DrawMessage
import com.example.remote.RemoteCommandManager
import com.example.remote.SupabaseRealtimeManager
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class DrawProtocolTest {

    @Test
    fun testSyncRequestPayload() {
        val sync = DrawMessage.createSyncRequest()
        assertEquals("sync_request", sync.getString("type"))
        assertFalse("sync_request should only have type property", sync.has("timestamp"))
    }

    @Test
    fun testDrawRequestPayload() {
        val uuid = "12345678-1234-1234-1234-123456789abc"
        val req = DrawMessage.createDrawRequest(uuid)
        assertEquals("draw_request", req.getString("type"))
        assertEquals(uuid, req.getString("request_id"))
    }

    @Test
    fun testParseDrawPermission() {
        val json = JSONObject("""
            {
              "type": "draw_permission",
              "mobile_remote_enabled": true,
              "next_draw_allowed": true,
              "draw_in_progress": false,
              "device_connected": true
            }
        """.trimIndent())

        val msg = DrawMessage.fromJson(json)
        assertNotNull(msg)
        assertEquals("draw_permission", msg.type)
        assertEquals(true, msg.mobileRemoteEnabled)
        assertEquals(true, msg.nextDrawAllowed)
        assertEquals(false, msg.drawInProgress)
        assertEquals(true, msg.deviceConnected)
    }

    @Test
    fun testParseDrawAckAccepted() {
        val json = JSONObject("""
            {
              "type": "draw_ack",
              "request_id": "test-req-id",
              "status": "accepted"
            }
        """.trimIndent())

        val msg = DrawMessage.fromJson(json)
        assertNotNull(msg)
        assertEquals("draw_ack", msg.type)
        assertEquals("test-req-id", msg.requestId)
        assertTrue(msg.isAccepted)
        assertFalse(msg.isRejected)
    }

    @Test
    fun testParseDrawAckRejectedWithReason() {
        val json = JSONObject("""
            {
              "type": "draw_ack",
              "request_id": "test-req-id-2",
              "status": "rejected",
              "reason": "NEXT_DRAW_NOT_ALLOWED"
            }
        """.trimIndent())

        val msg = DrawMessage.fromJson(json)
        assertNotNull(msg)
        assertEquals("draw_ack", msg.type)
        assertEquals("test-req-id-2", msg.requestId)
        assertTrue(msg.isRejected)
        assertEquals("NEXT_DRAW_NOT_ALLOWED", msg.reason)
    }

    @Test
    fun testParseDrawLifecycleNumbers() {
        val startJson = JSONObject("""
            {
              "type": "draw_started",
              "draw_number": 7
            }
        """.trimIndent())
        val startMsg = DrawMessage.fromJson(startJson)
        assertEquals(7, startMsg.drawNumber)

        val completeJson = JSONObject("""
            {
              "type": "draw_completed",
              "draw_number": 7
            }
        """.trimIndent())
        val completeMsg = DrawMessage.fromJson(completeJson)
        assertEquals(7, completeMsg.drawNumber)
    }

    @Test
    fun testRemoteCommandManagerStateRules() {
        val realtimeManager = SupabaseRealtimeManager()
        val commandManager = RemoteCommandManager(realtimeManager)

        // Rule 1: mobile_remote_enabled == false -> WAITING_FOR_PERMISSION (DRAW UNAVAILABLE)
        commandManager.onConnected()
        val permission1 = DrawMessage.fromJson(JSONObject("""
            {
              "type": "draw_permission",
              "mobile_remote_enabled": false,
              "next_draw_allowed": true,
              "draw_in_progress": false,
              "device_connected": true
            }
        """.trimIndent()))
        commandManager.onMessageReceived(permission1)
        assertEquals(ConnectionState.WAITING_FOR_PERMISSION, commandManager.currentState)

        // Rule 2: next_draw_allowed == false -> WAITING_FOR_PERMISSION (DRAW UNAVAILABLE)
        val permission2 = DrawMessage.fromJson(JSONObject("""
            {
              "type": "draw_permission",
              "mobile_remote_enabled": true,
              "next_draw_allowed": false,
              "draw_in_progress": false,
              "device_connected": true
            }
        """.trimIndent()))
        commandManager.onMessageReceived(permission2)
        assertEquals(ConnectionState.WAITING_FOR_PERMISSION, commandManager.currentState)

        // Rule 3: draw_in_progress == true -> DRAWING
        val permission3 = DrawMessage.fromJson(JSONObject("""
            {
              "type": "draw_permission",
              "mobile_remote_enabled": true,
              "next_draw_allowed": true,
              "draw_in_progress": true,
              "device_connected": true
            }
        """.trimIndent()))
        commandManager.onMessageReceived(permission3)
        assertEquals(ConnectionState.DRAWING, commandManager.currentState)

        // Rule 4: all three checks pass -> DRAW_AVAILABLE
        val permission4 = DrawMessage.fromJson(JSONObject("""
            {
              "type": "draw_permission",
              "mobile_remote_enabled": true,
              "next_draw_allowed": true,
              "draw_in_progress": false,
              "device_connected": true
            }
        """.trimIndent()))
        commandManager.onMessageReceived(permission4)
        assertEquals(ConnectionState.DRAW_AVAILABLE, commandManager.currentState)

        // Lifecycle: draw_completed should consume next_draw_allowed and wait for PC
        val completeMsg = DrawMessage.fromJson(JSONObject("""
            {
              "type": "draw_completed",
              "draw_number": 7
            }
        """.trimIndent()))
        commandManager.onMessageReceived(completeMsg)
        assertEquals(ConnectionState.WAITING_FOR_PERMISSION, commandManager.currentState)
        assertFalse("nextDrawAllowed must remain false after draw_completed until PC allows it", commandManager.isNextDrawAllowed)
    }
}
