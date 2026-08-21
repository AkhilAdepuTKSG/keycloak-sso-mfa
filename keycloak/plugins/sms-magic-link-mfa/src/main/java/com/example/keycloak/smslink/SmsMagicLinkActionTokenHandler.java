package com.example.keycloak.smslink;

import jakarta.ws.rs.core.Response;
import org.keycloak.TokenVerifier.Predicate;
import org.keycloak.authentication.AuthenticationProcessor;
import org.keycloak.authentication.actiontoken.AbstractActionTokenHandler;
import org.keycloak.authentication.actiontoken.ActionTokenContext;
import org.keycloak.events.Errors;
import org.keycloak.events.EventType;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.UserModel;
import org.keycloak.services.messages.Messages;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Runs when the user taps the link. By the time handleToken() is called, Keycloak has
 * already checked the signature, the expiry and single-use state, so all that is left
 * is to mark the session verified and drop back into the browser flow.
 */
public class SmsMagicLinkActionTokenHandler extends AbstractActionTokenHandler<SmsMagicLinkActionToken> {

    public SmsMagicLinkActionTokenHandler() {
        super(SmsMagicLinkActionToken.TOKEN_TYPE,
              SmsMagicLinkActionToken.class,
              Messages.INVALID_REQUEST,
              EventType.LOGIN,
              Errors.INVALID_REQUEST);
    }

    @Override
    public Predicate<? super SmsMagicLinkActionToken>[] getVerifiers(
            ActionTokenContext<SmsMagicLinkActionToken> tokenContext) {
        return new Predicate[]{};
    }

    @Override
    public boolean canUseTokenRepeatedly(SmsMagicLinkActionToken token,
                                         ActionTokenContext<SmsMagicLinkActionToken> tokenContext) {
        return false; // single use
    }

    @Override
    public String getAuthenticationSessionIdFromToken(SmsMagicLinkActionToken token,
                                                      ActionTokenContext<SmsMagicLinkActionToken> tokenContext,
                                                      AuthenticationSessionModel currentAuthSession) {
        return token.getAuthenticationSessionId();
    }

    @Override
    public Response handleToken(SmsMagicLinkActionToken token,
                                ActionTokenContext<SmsMagicLinkActionToken> tokenContext) {
        KeycloakSession session = tokenContext.getSession();
        AuthenticationSessionModel authSession = tokenContext.getAuthenticationSession();

        UserModel user = session.users().getUserById(tokenContext.getRealm(), token.getUserId());
        if (user == null || !user.isEnabled()) {
            return session.getProvider(org.keycloak.forms.login.LoginFormsProvider.class)
                    .setError(Messages.INVALID_USER)
                    .createErrorPage(Response.Status.BAD_REQUEST);
        }

        authSession.setAuthenticatedUser(user);
        authSession.setAuthNote(SmsMagicLinkAuthenticator.LINK_VERIFIED_NOTE, "true");

        tokenContext.getEvent().user(user).detail("sms_link_consumed", "true");

        // Re-enter the browser flow. Our authenticator sees LINK_VERIFIED_NOTE and succeeds.
        return tokenContext.processFlow(
                false,
                authSession.getAuthNote(AuthenticationProcessor.CURRENT_AUTHENTICATION_EXECUTION),
                tokenContext.getRealm().getBrowserFlow(),
                null,
                new AuthenticationProcessor());
    }
}
