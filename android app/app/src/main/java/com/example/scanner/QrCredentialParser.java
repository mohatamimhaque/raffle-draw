package com.example.scanner;

import android.net.Uri;
import android.util.Base64;
import org.json.JSONObject;

import java.net.URI;

/**
 * Professional parser and strict validator for QR code credentials.
 * Supports JSON payloads, deep links, and key-value formats.
 */
public class QrCredentialParser {

    public static class Credentials {
        public final String url;
        public final String key;
        public final String channel;
        public final String sessionId;

        public Credentials(String url, String key, String channelInput) {
            this.url = url != null ? cleanUrl(url) : "";
            this.key = key != null ? key.trim() : "";
            String raw = channelInput != null ? channelInput.trim() : "";
            if (raw.isEmpty()) {
                this.channel = "";
                this.sessionId = "";
            } else if (raw.startsWith("raffle_remote:")) {
                this.channel = raw;
                this.sessionId = raw.substring("raffle_remote:".length());
            } else if (raw.equals("raffle_remote")) {
                this.channel = raw;
                this.sessionId = raw;
            } else {
                this.channel = "raffle_remote:" + raw;
                this.sessionId = raw;
            }
        }

        public boolean isValid() {
            return validateCredentials(this).isValid;
        }
    }

    public static class ValidationResult {
        public final boolean isValid;
        public final String errorMessage;
        public final Credentials credentials;

        public ValidationResult(boolean isValid, String errorMessage, Credentials credentials) {
            this.isValid = isValid;
            this.errorMessage = errorMessage;
            this.credentials = credentials;
        }

        public static ValidationResult valid(Credentials credentials) {
            return new ValidationResult(true, null, credentials);
        }

        public static ValidationResult invalid(String errorMessage) {
            return new ValidationResult(false, errorMessage, null);
        }
    }

    /**
     * Parses raw QR code string and performs strict validity checks based on web developer contract.
     */
    public static ValidationResult validate(String rawContent) {
        if (rawContent == null || rawContent.trim().isEmpty()) {
            return ValidationResult.invalid("Scanned QR code is empty");
        }

        String content = rawContent.trim();
        Credentials extracted = null;

        // 1. Try parsing JSON format (primary contract)
        if (content.startsWith("{") && content.endsWith("}")) {
            try {
                JSONObject json = new JSONObject(content);
                // URL: use first non-empty from url, supabase_url
                String url = optString(json, "url", "supabase_url", "supabaseUrl");
                // Key: use first non-empty from key, supabase_key, anon_key, supabase_anon_key
                String key = optString(json, "key", "supabase_key", "anon_key", "supabase_anon_key", "supabaseKey", "anonKey");
                // Channel/session: prefer channel when present, otherwise session, session_id
                String channelVal = optString(json, "channel", "session", "session_id", "sessionId");

                if (url == null && key == null && channelVal == null) {
                    return ValidationResult.invalid("JSON does not contain Supabase connection information");
                }
                extracted = new Credentials(url, key, channelVal);
            } catch (Exception e) {
                return ValidationResult.invalid("Malformed JSON in QR code: " + e.getMessage());
            }
        }

        // 2. Try URI format (raffle://connect?url=...&key=... or https://...)
        if (extracted == null) {
            try {
                Uri uri = Uri.parse(content);
                if (uri != null && uri.isHierarchical()) {
                    String urlParam = uri.getQueryParameter("url");
                    if (urlParam == null) urlParam = uri.getQueryParameter("supabase_url");
                    String keyParam = uri.getQueryParameter("key");
                    if (keyParam == null) keyParam = uri.getQueryParameter("supabase_key");
                    if (keyParam == null) keyParam = uri.getQueryParameter("anon_key");
                    String sessionParam = uri.getQueryParameter("channel");
                    if (sessionParam == null) sessionParam = uri.getQueryParameter("session");
                    if (sessionParam == null) sessionParam = uri.getQueryParameter("session_id");

                    if (urlParam != null || keyParam != null) {
                        extracted = new Credentials(urlParam, keyParam, sessionParam);
                    }
                }
            } catch (Exception ignored) {
            }
        }

        // 3. Try key=value delimiter format
        if (extracted == null && (content.contains("url=") || content.contains("key="))) {
            String url = null;
            String key = null;
            String session = null;
            String[] pairs = content.split("[;\n&]");
            for (String pair : pairs) {
                int eq = pair.indexOf('=');
                if (eq > 0) {
                    String k = pair.substring(0, eq).trim().toLowerCase();
                    String v = pair.substring(eq + 1).trim();
                    if (k.equals("url") || k.equals("supabase_url")) url = v;
                    else if (k.equals("key") || k.equals("supabase_key") || k.equals("anon_key") || k.equals("supabase_anon_key")) key = v;
                    else if (k.equals("channel") || k.equals("session") || k.equals("session_id")) session = v;
                }
            }
            if (url != null || key != null) {
                extracted = new Credentials(url, key, session);
            }
        }

        if (extracted == null) {
            return ValidationResult.invalid("Unrecognized QR format. Please scan a valid controller QR code.");
        }

        return validateCredentials(extracted);
    }

    /**
     * Parses content directly into Credentials, or returns null if invalid.
     */
    public static Credentials parse(String rawContent) {
        ValidationResult result = validate(rawContent);
        return result.isValid ? result.credentials : null;
    }

    /**
     * Strict validity logic for Supabase Realtime credentials based on contract.
     */
    public static ValidationResult validateCredentials(Credentials creds) {
        if (creds == null) {
            return ValidationResult.invalid("No credentials provided");
        }

        // Validate URL
        if (creds.url == null || creds.url.trim().isEmpty()) {
            return ValidationResult.invalid("Supabase URL is missing");
        }
        String url = creds.url.trim();
        if (!url.startsWith("https://") && !url.startsWith("http://") &&
            !url.startsWith("wss://") && !url.startsWith("ws://")) {
            return ValidationResult.invalid("Invalid URL protocol. Must start with https:// or http://");
        }
        try {
            URI parsedUri = URI.create(url);
            String host = parsedUri.getHost();
            if (host == null || !host.contains(".")) {
                return ValidationResult.invalid("Invalid domain host in Supabase URL: " + url);
            }
        } catch (Exception e) {
            return ValidationResult.invalid("Malformed URL syntax: " + e.getMessage());
        }

        // Validate Key (Supabase public anon key)
        if (creds.key == null || creds.key.trim().isEmpty()) {
            return ValidationResult.invalid("Supabase API Key is missing");
        }
        String key = creds.key.trim();
        if (key.length() < 16) {
            return ValidationResult.invalid("API key is too short (minimum 16 characters)");
        }
        if (key.contains(" ") || key.contains("\n") || key.contains("\t")) {
            return ValidationResult.invalid("API key cannot contain whitespace");
        }

        // Check for prohibited service-role key
        if (isServiceRoleKey(key)) {
            return ValidationResult.invalid("Service role keys are strictly prohibited for security. Please scan the public anon key.");
        }

        // If starts with eyJ (base64 of {"alg...), verify reasonable JWT structure
        if (key.startsWith("eyJ")) {
            if (!key.contains(".")) {
                return ValidationResult.invalid("Malformed JWT key format (missing dot separator)");
            }
            String[] parts = key.split("\\.");
            if (parts.length < 2 || parts.length > 3) {
                return ValidationResult.invalid("Invalid JWT format for Supabase key (must have 2 or 3 parts)");
            }
        }

        // Validate Channel name
        if (creds.channel == null || creds.channel.trim().isEmpty()) {
            return ValidationResult.invalid("Channel or session cannot be empty. Please scan a valid controller QR code.");
        }
        String channel = creds.channel.trim();
        if (channel.length() > 128) {
            return ValidationResult.invalid("Channel name is too long (maximum 128 characters)");
        }
        if (channel.contains(" ") || channel.contains("\n") || channel.contains("\t")) {
            return ValidationResult.invalid("Channel name cannot contain whitespace");
        }

        return ValidationResult.valid(creds);
    }

    private static boolean isServiceRoleKey(String key) {
        if (key == null) return false;
        String lower = key.toLowerCase();
        if (lower.contains("service_role") || lower.contains("service-role")) {
            return true;
        }
        if (key.startsWith("eyJ") && key.contains(".")) {
            try {
                String[] parts = key.split("\\.");
                if (parts.length >= 2) {
                    byte[] decoded = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
                    String payloadJson = new String(decoded).toLowerCase();
                    if (payloadJson.contains("\"role\":\"service_role\"") || payloadJson.contains("\"role\": \"service_role\"")) {
                        return true;
                    }
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    private static String optString(JSONObject json, String... keys) {
        for (String k : keys) {
            if (json.has(k)) {
                String val = json.optString(k, "").trim();
                if (!val.isEmpty()) return val;
            }
        }
        return null;
    }

    private static String cleanUrl(String raw) {
        String url = raw.trim();
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }
}
