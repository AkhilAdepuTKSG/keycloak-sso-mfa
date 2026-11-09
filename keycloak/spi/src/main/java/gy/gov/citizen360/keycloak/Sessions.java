package gy.gov.citizen360.keycloak;

import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserSessionModel;
import org.keycloak.services.managers.AuthenticationManager;

/** Finds the SSO session a step-up continues, so a step can see how that session was established. */
final class Sessions {

    private Sessions() {
    }

    static UserSessionModel existing(AuthenticationFlowContext ctx) {
        KeycloakSession session = ctx.getSession();
        RealmModel realm = ctx.getRealm();
        // The user session id equals the root authentication session id.
        UserSessionModel us = session.sessions().getUserSession(realm, ctx.getAuthenticationSession().getParentSession().getId());
        if (us != null) return us;
        AuthenticationManager.AuthResult cookie = AuthenticationManager.authenticateIdentityCookie(session, realm, true);
        return cookie == null ? null : cookie.getSession();
    }
}
