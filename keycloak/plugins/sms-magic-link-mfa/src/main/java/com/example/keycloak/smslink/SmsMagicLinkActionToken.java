package com.example.keycloak.smslink;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.keycloak.authentication.actiontoken.DefaultActionToken;

/**
 * Signed, expiring, single-use token that backs the link we put in the SMS.
 * Keycloak validates the signature, the expiry and (via the action-token store)
 * the single-use constraint before our handler is ever invoked.
 */
public class SmsMagicLinkActionToken extends DefaultActionToken {

    public static final String TOKEN_TYPE = "sms-magic-link";

    private static final String JSON_FIELD_AUTH_SESSION_ID = "asid";
    private static final String JSON_FIELD_REDIRECT_URI = "reduri";

    @JsonProperty(JSON_FIELD_AUTH_SESSION_ID)
    private String authenticationSessionId;

    @JsonProperty(JSON_FIELD_REDIRECT_URI)
    private String redirectUri;

    public SmsMagicLinkActionToken(String userId,
                                   int absoluteExpirationInSecs,
                                   String clientId,
                                   String authenticationSessionId,
                                   String redirectUri) {
        super(userId, TOKEN_TYPE, absoluteExpirationInSecs, null);
        this.issuedFor = clientId;
        this.authenticationSessionId = authenticationSessionId;
        this.redirectUri = redirectUri;
    }

    /** Required no-arg constructor for Jackson deserialization. */
    private SmsMagicLinkActionToken() {
        // NOOP
    }

    public String getAuthenticationSessionId() {
        return authenticationSessionId;
    }

    public String getRedirectUri() {
        return redirectUri;
    }
}
