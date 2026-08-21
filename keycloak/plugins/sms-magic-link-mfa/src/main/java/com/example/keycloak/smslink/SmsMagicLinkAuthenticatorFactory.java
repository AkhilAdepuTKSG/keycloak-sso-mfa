package com.example.keycloak.smslink;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.List;

/**
 * Exposes every tunable as an Admin Console config property, so the message text,
 * the link TTL and the gateway credentials are all editable per authentication flow
 * without rebuilding the JAR.
 */
public class SmsMagicLinkAuthenticatorFactory implements AuthenticatorFactory {

    public static final String PROVIDER_ID = "sms-magic-link-authenticator";

    // --- config keys, referenced from the authenticator ---
    public static final String CONF_MESSAGE_TEMPLATE = "smsMessageTemplate";
    public static final String CONF_LINK_TTL         = "smsLinkTtlSeconds";
    public static final String CONF_PHONE_ATTRIBUTE  = "smsPhoneAttribute";
    public static final String CONF_GATEWAY_URL      = "smsGatewayUrl";
    public static final String CONF_GATEWAY_TOKEN    = "smsGatewayToken";
    public static final String CONF_SENDER_ID        = "smsSenderId";

    private static final Requirement[] REQUIREMENT_CHOICES = {
            Requirement.REQUIRED,
            Requirement.ALTERNATIVE,
            Requirement.DISABLED
    };

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getDisplayType() {
        return "SMS Magic Link";
    }

    @Override
    public String getHelpText() {
        return "Sends the user a configurable SMS containing a signed, single-use sign-in link.";
    }

    @Override
    public String getReferenceCategory() {
        return "sms";
    }

    @Override
    public boolean isConfigurable() {
        return true;
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    @Override
    public Requirement[] getRequirementChoices() {
        return REQUIREMENT_CHOICES;
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        ProviderConfigProperty template = new ProviderConfigProperty();
        template.setName(CONF_MESSAGE_TEMPLATE);
        template.setLabel("SMS message template");
        template.setType(ProviderConfigProperty.TEXT_TYPE);
        template.setHelpText("Body of the text message. {0} is replaced with the sign-in link, "
                + "{1} with the username, {2} with the link lifetime in minutes.");
        template.setDefaultValue("Tap to sign in: {0} (expires in {2} minutes)");

        ProviderConfigProperty ttl = new ProviderConfigProperty();
        ttl.setName(CONF_LINK_TTL);
        ttl.setLabel("Link lifetime (seconds)");
        ttl.setType(ProviderConfigProperty.STRING_TYPE);
        ttl.setHelpText("How long the link stays valid. Keep this short: 300-600 is typical.");
        ttl.setDefaultValue("300");

        ProviderConfigProperty phoneAttr = new ProviderConfigProperty();
        phoneAttr.setName(CONF_PHONE_ATTRIBUTE);
        phoneAttr.setLabel("Phone number user attribute");
        phoneAttr.setType(ProviderConfigProperty.STRING_TYPE);
        phoneAttr.setHelpText("User attribute holding the E.164 mobile number.");
        phoneAttr.setDefaultValue("mobile_number");

        ProviderConfigProperty url = new ProviderConfigProperty();
        url.setName(CONF_GATEWAY_URL);
        url.setLabel("SMS gateway URL");
        url.setType(ProviderConfigProperty.STRING_TYPE);
        url.setHelpText("HTTP endpoint that accepts a JSON body of {to, from, text}.");

        ProviderConfigProperty token = new ProviderConfigProperty();
        token.setName(CONF_GATEWAY_TOKEN);
        token.setLabel("SMS gateway bearer token");
        token.setType(ProviderConfigProperty.PASSWORD);
        token.setSecret(true);
        token.setHelpText("Sent as 'Authorization: Bearer <token>'.");

        ProviderConfigProperty sender = new ProviderConfigProperty();
        sender.setName(CONF_SENDER_ID);
        sender.setLabel("Sender ID");
        sender.setType(ProviderConfigProperty.STRING_TYPE);
        sender.setHelpText("Alphanumeric sender ID or originating number.");

        return List.of(template, ttl, phoneAttr, url, token, sender);
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return new SmsMagicLinkAuthenticator(session);
    }

    @Override
    public void init(Config.Scope config) {
        // NOOP
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // NOOP
    }

    @Override
    public void close() {
        // NOOP
    }
}
