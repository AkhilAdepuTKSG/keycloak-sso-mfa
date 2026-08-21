package com.example.keycloak.smslink;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.services.messages.Messages;
import org.keycloak.services.resources.LoginActionsService;
import org.keycloak.sessions.AuthenticationSessionModel;

import java.text.MessageFormat;
import java.util.Map;

import static com.example.keycloak.smslink.SmsMagicLinkAuthenticatorFactory.*;

/**
 * Flow:
 *   1. First pass  -> render a form asking for the username/phone.
 *   2. action()    -> resolve the user, mint an action token, format the configured
 *                     message, hand it to the gateway, then park the browser on an info page.
 *   3. The user taps the link, the action-token handler validates it and re-enters this
 *      same execution with LINK_VERIFIED_NOTE set, at which point we succeed.
 */
public class SmsMagicLinkAuthenticator implements Authenticator {

    private static final Logger log = Logger.getLogger(SmsMagicLinkAuthenticator.class);

    public static final String LINK_VERIFIED_NOTE = "SMS_MAGIC_LINK_VERIFIED";

    private final KeycloakSession session;

    public SmsMagicLinkAuthenticator(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        AuthenticationSessionModel authSession = context.getAuthenticationSession();

        // Second entry: the user came back through the link, so we are done.
        if (Boolean.parseBoolean(authSession.getAuthNote(LINK_VERIFIED_NOTE))) {
            authSession.removeAuthNote(LINK_VERIFIED_NOTE);
            context.success();
            return;
        }

        // If an earlier execution already identified the user, skip straight to sending.
        if (context.getUser() != null) {
            sendLink(context, context.getUser());
            return;
        }

        context.challenge(context.form().createForm("sms-link-username.ftl"));
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        String username = formData.getFirst("username");

        if (username == null || username.isBlank()) {
            context.challengeFailure(
                    org.keycloak.authentication.AuthenticationFlowError.INVALID_USER,
                    context.form().setError(Messages.MISSING_USERNAME).createForm("sms-link-username.ftl"));
            return;
        }

        RealmModel realm = context.getRealm();
        UserModel user = session.users().getUserByUsername(realm, username.trim());

        // Do not leak whether the account exists: show the same confirmation either way.
        if (user == null || !user.isEnabled()) {
            log.debugf("No enabled user for '%s', showing generic confirmation", username);
            context.forceChallenge(confirmationPage(context));
            return;
        }

        context.setUser(user);
        sendLink(context, user);
    }

    private void sendLink(AuthenticationFlowContext context, UserModel user) {
        Map<String, String> config = configOf(context);

        String phoneAttribute = config.getOrDefault(CONF_PHONE_ATTRIBUTE, "mobile_number");
        String phoneNumber = user.getFirstAttribute(phoneAttribute);

        if (phoneNumber == null || phoneNumber.isBlank()) {
            log.warnf("User %s has no value for attribute '%s'", user.getUsername(), phoneAttribute);
            context.forceChallenge(confirmationPage(context));
            return;
        }

        int ttlSeconds = parseIntOr(config.get(CONF_LINK_TTL), 300);
        String link = buildLink(context, user, ttlSeconds);

        String template = config.getOrDefault(CONF_MESSAGE_TEMPLATE,
                "Tap to sign in: {0} (expires in {2} minutes)");
        String body = MessageFormat.format(template, link, user.getUsername(), ttlSeconds / 60);

        try {
            new SmsGateway(config).send(phoneNumber, body);
            context.getEvent().user(user).detail("sms_link_sent", "true").success();
        } catch (Exception e) {
            log.error("Failed to dispatch SMS magic link", e);
            context.failureChallenge(
                    org.keycloak.authentication.AuthenticationFlowError.INTERNAL_ERROR,
                    context.form().setError("smsLinkSendFailed").createErrorPage(Response.Status.INTERNAL_SERVER_ERROR));
            return;
        }

        context.forceChallenge(confirmationPage(context));
    }

    /**
     * Serializes a signed action token and wraps it in Keycloak's action-token endpoint URI.
     * Never build this URL by hand: the query parameters below are what let Keycloak
     * reattach the browser to the original authentication session.
     */
    private String buildLink(AuthenticationFlowContext context, UserModel user, int ttlSeconds) {
        AuthenticationSessionModel authSession = context.getAuthenticationSession();
        int absoluteExpiry = (int) (System.currentTimeMillis() / 1000L) + ttlSeconds;

        SmsMagicLinkActionToken token = new SmsMagicLinkActionToken(
                user.getId(),
                absoluteExpiry,
                authSession.getClient().getClientId(),
                authSession.getParentSession().getId(),
                authSession.getRedirectUri());

        String serialized = token.serialize(
                session, context.getRealm(), context.getUriInfo());

        return LoginActionsService.actionTokenProcessor(context.getUriInfo())
                .queryParam("key", serialized)
                .queryParam("client_id", authSession.getClient().getClientId())
                .queryParam("tab_id", authSession.getTabId())
                .build(context.getRealm().getName())
                .toString();
    }

    private Response confirmationPage(AuthenticationFlowContext context) {
        return context.form()
                .setInfo("smsLinkSentInfo")
                .createForm("sms-link-sent.ftl");
    }

    private Map<String, String> configOf(AuthenticationFlowContext context) {
        AuthenticatorConfigModel model = context.getAuthenticatorConfig();
        return model == null ? Map.of() : model.getConfig();
    }

    private static int parseIntOr(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException | NullPointerException e) {
            return fallback;
        }
    }

    @Override
    public boolean requiresUser() {
        return false;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
        // NOOP
    }

    @Override
    public void close() {
        // NOOP
    }
}
