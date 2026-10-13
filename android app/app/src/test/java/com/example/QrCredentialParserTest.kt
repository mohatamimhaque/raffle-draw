package com.example

import com.example.scanner.QrCredentialParser
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class QrCredentialParserTest {

    @Test
    fun testParseStandardJsonQr() {
        val qrJson = """
            {
              "url": "https://xyzproject.supabase.co",
              "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.testkey",
              "session": "CSEFEST26"
            }
        """.trimIndent()

        val result = QrCredentialParser.validate(qrJson)
        assertTrue(result.isValid)
        assertNotNull(result.credentials)
        assertEquals("https://xyzproject.supabase.co", result.credentials.url)
        assertEquals("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.testkey", result.credentials.key)
        assertEquals("CSEFEST26", result.credentials.sessionId)
    }

    @Test
    fun testParseAlternativeKeyNamesJson() {
        val qrJson = """
            {
              "supabase_url": "https://demo-raffle-project.supabase.co/",
              "supabase_key": "eyJhbGciOiJIUzI1NiIs.someothervalidkey",
              "channel": "raffle_room_1"
            }
        """.trimIndent()

        val creds = QrCredentialParser.parse(qrJson)
        assertNotNull(creds)
        // Trailing slash should be cleaned
        assertEquals("https://demo-raffle-project.supabase.co", creds?.url)
        assertEquals("eyJhbGciOiJIUzI1NiIs.someothervalidkey", creds?.key)
        assertEquals("raffle_room_1", creds?.sessionId)
    }

    @Test
    fun testParseUriFormatQr() {
        val qrUri = "raffle://connect?url=https%3A%2F%2Fexample.supabase.co&key=samplejwttoken123456789&session=STAGEDRAW"
        val creds = QrCredentialParser.parse(qrUri)
        assertNotNull(creds)
        assertEquals("https://example.supabase.co", creds?.url)
        assertEquals("samplejwttoken123456789", creds?.key)
        assertEquals("STAGEDRAW", creds?.sessionId)
    }

    @Test
    fun testParseKeyValuePairs() {
        val qrText = "url=https://custom.supabase.co;key=testkey1234567890;session=ROOM101"
        val creds = QrCredentialParser.parse(qrText)
        assertNotNull(creds)
        assertEquals("https://custom.supabase.co", creds?.url)
        assertEquals("testkey1234567890", creds?.key)
        assertEquals("ROOM101", creds?.sessionId)
    }

    @Test
    fun testValidateInvalidPayloads() {
        assertFalse(QrCredentialParser.validate(null).isValid)
        assertFalse(QrCredentialParser.validate("").isValid)
        assertFalse(QrCredentialParser.validate("just random text").isValid)
        assertFalse(QrCredentialParser.validate("""{"invalid":"json"}""").isValid)

        // Invalid protocol
        val badProtocol = """{"url":"ftp://project.supabase.co","key":"validjwtpart1.validjwtpart2.validjwtpart3"}"""
        val badProtocolResult = QrCredentialParser.validate(badProtocol)
        assertFalse(badProtocolResult.isValid)
        assertTrue(badProtocolResult.errorMessage.contains("protocol", ignoreCase = true))

        // Short / invalid key
        val shortKey = """{"url":"https://project.supabase.co","key":"short"}"""
        val shortKeyResult = QrCredentialParser.validate(shortKey)
        assertFalse(shortKeyResult.isValid)
        assertTrue(shortKeyResult.errorMessage.contains("short", ignoreCase = true))
    }
}
