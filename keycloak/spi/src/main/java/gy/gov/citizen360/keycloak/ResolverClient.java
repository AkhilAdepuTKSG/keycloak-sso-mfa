package gy.gov.citizen360.keycloak;

import com.fasterxml.jackson.databind.JsonNode;
import org.jboss.logging.Logger;
import org.keycloak.util.JsonSerialization;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Calls the Citizen 360 Resolver API. Keycloak never talks to ClickHouse.
 *
 * Any transport error, timeout or 5xx becomes UNAVAILABLE, which the login form
 * shows as "try again". It is never treated as "not found" (design doc, F5).
 */
public class ResolverClient {

    private static final Logger LOG = Logger.getLogger(ResolverClient.class);

    public enum Outcome { FOUND, NOT_FOUND, CONFLICT, SHARED_CONTACT, INACTIVE, UNAVAILABLE }

    public record Resolution(Outcome outcome, String cid, String loa, int owners) {
        static Resolution of(Outcome o) {
            return new Resolution(o, null, null, 0);
        }
    }

    public record Profile(boolean available, String cid, String eid, String loa) {
        static Profile unavailable() {
            return new Profile(false, null, null, null);
        }
    }

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(1500))
            .version(HttpClient.Version.HTTP_1_1)
            .build();

    private final String baseUrl;
    private final String serviceKey;
    private final Duration timeout;

    public ResolverClient(String baseUrl, String serviceKey, Duration timeout) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.serviceKey = serviceKey;
        this.timeout = timeout;
    }

    public static ResolverClient fromEnv() {
        String url = env("CITIZEN_RESOLVER_URL", "http://resolver:8090");
        String key = env("CITIZEN_RESOLVER_KEY", "");
        long ms = Long.parseLong(env("CITIZEN_RESOLVER_TIMEOUT_MS", "3000"));
        return new ResolverClient(url, key, Duration.ofMillis(ms));
    }

    static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }

    /** resolve(type, value) → CID. */
    public Resolution resolve(String type, String value) {
        try {
            String body = JsonSerialization.writeValueAsString(Map.of("type", type, "value", value));
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/v1/resolve"))
                    .timeout(timeout)
                    .header("Content-Type", "application/json")
                    .header("X-Service-Key", serviceKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            int status = resp.statusCode();
            JsonNode json = parse(resp.body());
            switch (status) {
                case 200: {
                    String cid = text(json, "cid");
                    if (cid == null) return Resolution.of(Outcome.UNAVAILABLE);
                    return new Resolution(Outcome.FOUND, cid, text(json, "loa"), 1);
                }
                case 404:
                    return Resolution.of(Outcome.NOT_FOUND);
                case 409: {
                    int owners = json == null ? 2 : json.path("owners").asInt(2);
                    boolean shared = json != null && "shared_contact".equals(json.path("reason").asText());
                    return new Resolution(shared ? Outcome.SHARED_CONTACT : Outcome.CONFLICT, null, null, owners);
                }
                case 410:
                    return Resolution.of(Outcome.INACTIVE);
                default:
                    LOG.warnf("Resolver answered %d for resolve(%s); treating as unavailable", status, type);
                    return Resolution.of(Outcome.UNAVAILABLE);
            }
        } catch (IOException e) {
            LOG.warnf("Resolver unreachable for resolve(%s): %s", type, e.toString());
            return Resolution.of(Outcome.UNAVAILABLE);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Resolution.of(Outcome.UNAVAILABLE);
        }
    }

    /** The person's active IDs (wide row). Used by the EID step-up to see whether an EID exists. */
    public Profile profile(String cid) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/v1/profile/" + URLEncoder.encode(cid, StandardCharsets.UTF_8)))
                    .timeout(timeout)
                    .header("X-Service-Key", serviceKey)
                    .GET()
                    .build();
            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 404) return new Profile(true, cid, null, null);
            if (resp.statusCode() != 200) {
                LOG.warnf("Resolver answered %d for profile; treating as unavailable", resp.statusCode());
                return Profile.unavailable();
            }
            JsonNode json = parse(resp.body());
            if (json == null) return Profile.unavailable();
            JsonNode ids = json.path("ids");
            return new Profile(true, text(json, "cid"), text(ids, "eid"), text(json.path("person"), "loa"));
        } catch (IOException e) {
            LOG.warnf("Resolver unreachable for profile: %s", e.toString());
            return Profile.unavailable();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Profile.unavailable();
        }
    }

    private static JsonNode parse(String body) {
        if (body == null || body.isBlank()) return null;
        try {
            return JsonSerialization.mapper.readTree(body);
        } catch (IOException e) {
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode v = node.get(field);
        return v == null || v.isNull() || v.asText().isEmpty() ? null : v.asText();
    }
}
