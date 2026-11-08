package gy.gov.citizen360.keycloak;

import jakarta.ws.rs.core.MultivaluedMap;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.authenticators.browser.AbstractUsernameFormAuthenticator;
import org.keycloak.authentication.authenticators.util.AuthenticatorUtils;
import org.keycloak.events.Errors;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserCredentialModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserSessionModel;
import org.keycloak.services.managers.AuthenticationManager;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * The level-3 (High) step of the browser flow. It runs only when a client asks
 * for acr "high" and the SSO session hasn't reached it yet, so the user is
 * already known: this is a step-up, not a second login.
 *
 *  - Session established with the EID (in this or an earlier login): passes with no UI.
 *  - The person has an EID in Citizen 360: asks them to confirm with it.
 *  - The person has no EID: shows the "link or enrol your EID" page.
 *
 * In this POC "confirm with your EID" means EID number + account password. A real
 * deployment would use the EID card and PIN, or broker to an EID identity provider.
 */
public class EidStepUpAuthenticator implements Authenticator {

    private static final Logger LOG = Logger.getLogger(EidStepUpAuthenticator.class);

    static final String TEMPLATE_STEP_UP = "citizen-eid-step-up.ftl";
    static final String TEMPLATE_ENROL = "citizen-eid-enrol.ftl";
    public static final String NOTE_EID_VERIFIED = "citizen.eid_verified";

    private final ResolverClient resolver;

    public EidStepUpAuthenticator(ResolverClient resolver) {
        this.resolver = resolver;
    }

    @Override
    public void authenticate(AuthenticationFlowContext ctx) {
        if (establishedWithEid(ctx)) {
            ctx.getAuthenticationSession().setUserSessionNote(NOTE_EID_VERIFIED, "true");
            ctx.success();
            return;
        }
        ResolverClient.Profile profile = resolver.profile(ctx.getUser().getUsername());
        if (!profile.available()) {
            ctx.challenge(stepUpForm(ctx, "").setError("c360TryAgain").createForm(TEMPLATE_STEP_UP));
            return;
        }
        if (profile.eid() == null) {
            ctx.getEvent().detail("citizen_step_up", "no_eid");
            ctx.challenge(enrolPage(ctx).createForm(TEMPLATE_ENROL));
            return;
        }
        ctx.challenge(stepUpForm(ctx, "").createForm(TEMPLATE_STEP_UP));
    }

    @Override
    public void action(AuthenticationFlowContext ctx) {
        MultivaluedMap<String, String> params = ctx.getHttpRequest().getDecodedFormParameters();
        if (params.containsKey("cancel")) {
            ctx.cancelLogin();
            return;
        }
        if (params.containsKey("retry")) {
            authenticate(ctx);
            return;
        }

        String raw = params.getFirst("identifier");
        String password = params.getFirst("password");
        String value = IdType.normalise(raw);
        if (value.isEmpty() || password == null || password.isEmpty()) {
            ctx.challenge(stepUpForm(ctx, raw).setError("c360MissingFields").createForm(TEMPLATE_STEP_UP));
            return;
        }
        if (IdType.detect(value).orElse(null) != IdType.EID) {
            ctx.challenge(stepUpForm(ctx, raw).setError("c360EidRequired").createForm(TEMPLATE_STEP_UP));
            return;
        }

        UserModel user = ctx.getUser();
        ResolverClient.Resolution r = resolver.resolve(IdType.EID.name(), value);
        switch (r.outcome()) {
            case UNAVAILABLE -> {
                ctx.challenge(stepUpForm(ctx, raw).setError("c360TryAgain").createForm(TEMPLATE_STEP_UP));
                return;
            }
            case CONFLICT -> {
                LOG.warnf("EID step-up refused: EID has %d active owners", r.owners());
                ctx.challenge(stepUpForm(ctx, raw).setError("c360IdConflict", IdType.EID.label()).createForm(TEMPLATE_STEP_UP));
                return;
            }
            default -> {
                // FOUND / NOT_FOUND / INACTIVE handled below
            }
        }

        ctx.getAuthenticationSession().setAuthNote(AbstractUsernameFormAuthenticator.ATTEMPTED_USERNAME, user.getUsername());
        String bruteForceError = AuthenticatorUtils.getDisabledByBruteForceEventError(ctx, user);
        if (bruteForceError != null) {
            ctx.getEvent().user(user).error(bruteForceError);
            ctx.forceChallenge(stepUpForm(ctx, raw).setError("c360EidNotLinked").createForm(TEMPLATE_STEP_UP));
            return;
        }

        boolean sameAccount = r.outcome() == ResolverClient.Outcome.FOUND && user.getUsername().equalsIgnoreCase(r.cid());
        if (!sameAccount || !user.credentialManager().isValid(UserCredentialModel.password(password))) {
            if (!sameAccount) AuthenticatorUtils.dummyHash(ctx);
            ctx.getEvent().user(user).error(Errors.INVALID_USER_CREDENTIALS);
            ctx.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS,
                    stepUpForm(ctx, raw).setError("c360EidNotLinked").createForm(TEMPLATE_STEP_UP));
            return;
        }

        ctx.getAuthenticationSession().setUserSessionNote(NOTE_EID_VERIFIED, "true");
        ctx.success();
    }

    /** True when this login, or the SSO session it continues, was established with the EID. */
    private boolean establishedWithEid(AuthenticationFlowContext ctx) {
        AuthenticationSessionModel authSession = ctx.getAuthenticationSession();
        if (IdType.EID.name().equals(authSession.getAuthNote(CitizenIdentifierAuthenticator.NOTE_ID_TYPE))) {
            return true;
        }
        UserSessionModel userSession = existingUserSession(ctx);
        if (userSession == null || !userSession.getUser().getId().equals(ctx.getUser().getId())) return false;
        return IdType.EID.name().equals(userSession.getNote(CitizenIdentifierAuthenticator.NOTE_ID_TYPE))
                || "true".equals(userSession.getNote(NOTE_EID_VERIFIED));
    }

    private UserSessionModel existingUserSession(AuthenticationFlowContext ctx) {
        KeycloakSession session = ctx.getSession();
        RealmModel realm = ctx.getRealm();
        // The user session id equals the root authentication session id.
        UserSessionModel us = session.sessions().getUserSession(realm, ctx.getAuthenticationSession().getParentSession().getId());
        if (us != null) return us;
        AuthenticationManager.AuthResult cookie = AuthenticationManager.authenticateIdentityCookie(session, realm, true);
        return cookie == null ? null : cookie.getSession();
    }

    private LoginFormsProvider stepUpForm(AuthenticationFlowContext ctx, String identifier) {
        return ctx.form()
                .setAttribute("c360Portal", portalName(ctx))
                .setAttribute("c360Identifier", identifier == null ? "" : identifier.trim())
                .setAttribute("c360HomeUrl", ResolverClient.env("CITIZEN_HOME_URL", "http://localhost:7200"));
    }

    private LoginFormsProvider enrolPage(AuthenticationFlowContext ctx) {
        return ctx.form()
                .setAttribute("c360Portal", portalName(ctx))
                .setAttribute("c360HomeUrl", ResolverClient.env("CITIZEN_HOME_URL", "http://localhost:7200"));
    }

    private static String portalName(AuthenticationFlowContext ctx) {
        var client = ctx.getAuthenticationSession().getClient();
        return client.getName() == null || client.getName().isBlank() ? client.getClientId() : client.getName();
    }

    @Override
    public boolean requiresUser() {
        return true;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
    }

    @Override
    public void close() {
    }
}
