package com.example.keycloak.smslink;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

import static com.example.keycloak.smslink.SmsMagicLinkAuthenticatorFactory.*;

/**
 * Minimal HTTP gateway client. Swap the body shape for whatever your provider expects
 * (Twilio wants form-encoded, MessageBird and most others take JSON).
 */
public class SmsGateway {

    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final Map<String, String> config;

    public SmsGateway(Map<String, String> config) {
        this.config = config;
    }

    public void send(String to, String text) throws Exception {
        String url = config.get(CONF_GATEWAY_URL);
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("SMS gateway URL is not configured");
        }

        String payload = String.format(
                "{\"to\":\"%s\",\"from\":\"%s\",\"text\":\"%s\"}",
                escape(to),
                escape(config.getOrDefault(CONF_SENDER_ID, "")),
                escape(text));

        HttpRequest.Builder request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload));

        String bearer = config.get(CONF_GATEWAY_TOKEN);
        if (bearer != null && !bearer.isBlank()) {
            request.header("Authorization", "Bearer " + bearer);
        }

        HttpResponse<String> response = CLIENT.send(request.build(),
                HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() / 100 != 2) {
            throw new IllegalStateException(
                    "SMS gateway returned HTTP " + response.statusCode() + ": " + response.body());
        }
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
