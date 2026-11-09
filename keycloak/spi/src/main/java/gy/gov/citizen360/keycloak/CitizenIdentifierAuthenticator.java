package gy.gov.citizen360.keycloak;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
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
import org.keycloak.sessions.AuthenticationSessionModel;

import java.util.Optional;

/**
 * Identifier-first login for the citizen realm.
 *
 * 1. The user types one ID and a password. The form only offers the ID types this
 *    portal (client) accepts.
 * 2. The ID's type is detected from its format. A type the portal doesn't accept
 *    is rejected with a clear message.
 * 3. The Resolver answers resolve(type, value) → CID from Citizen 360.
 *    0 active owners = not found, 1 = continue, 2+ = refuse (and the Resolver alerts).
 *    A shared contact (a family email) is refused with "use a government ID".
 *    Resolver/ClickHouse down = "try again", never "not found".
 * 4. Keycloak loads the user by username = CID and checks the password.
 *
 * The same class runs in two places of the browser flow:
 *  - level 1 (basic), {@code verifiedStepUp = false}: the login form. Signing in with an
 *    email gives Basic; with a government ID the session is also good for Verified.
 *  - level 2 (verified), {@code verifiedStepUp = true}: passes silently when the login used
 *    a government ID. After an email-only login it asks the signed-in person to confirm
 *    with a government ID (and only accepts their own).
 *
 * Keycloak itself stores nothing but the CID username and credentials.
 */
public class CitizenIdentifierAuthenticator implements Authenticator {

    private static final Logger LOG = Logger.getLogger(CitizenIdentifierAuthenticator.class);

    static final String TEMPLATE = "citizen-identifier.ftl";
    /** Auth-session and user-session note: which ID type established this login (NIS, EID, EMAIL, ...). */
    public static final String NOTE_ID_TYPE = "citizen.login_id_type";
    /** User-session note: the person's assurance level in Citizen 360 (basic, verified, high). */
    public static final String NOTE_PERSON_LOA = "citizen.person_loa";

    private final ResolverClient resolver;
    private final boolean verifiedStepUp;

    public CitizenIdentifierAuthenticator(ResolverClient resolver, boolean verifiedStepUp) {
        this.resolver = resolver;
        this.verifiedStepUp = verifiedStepUp;
    }

    @Override
    public void authenticate(AuthenticationFlowContext ctx) {
        if (verifiedStepUp && establishedWithGovernmentId(ctx)) {
            ctx.success();
            return;
        }
        String hint = verifiedStepUp ? null : ctx.getAuthenticationSession().getClientNote("login_hint");
        ctx.challenge(form(ctx, hint).createForm(TEMPLATE));
    }

    @Override
    public void action(AuthenticationFlowContext ctx) {
        MultivaluedMap<String, String> params = ctx.getHttpRequest().getDecodedFormParameters();
        String raw = params.getFirst("identifier");
        String password = params.getFirst("password");
        PortalPolicy policy = policy(ctx);
        String value = IdType.normalise(raw);

        if (value.isEmpty() || password == null || password.isEmpty()) {
            ctx.challenge(form(ctx, raw).setError("c360MissingFields").createForm(TEMPLATE));
            return;
        }

        Optional<IdType> detected = IdType.detect(value);
        if (detected.isEmpty()) {
            ctx.getEvent().detail("citizen_id_type", "UNRECOGNISED").error(Errors.INVALID_USER_CREDENTIALS);
            ctx.challenge(form(ctx, raw).setError("c360UnrecognisedId", policy.acceptedPhrase()).createForm(TEMPLATE));
            return;
        }
        IdType type = detected.get();
        ctx.getEvent().detail("citizen_id_type", type.name());

        if (!policy.allowed().contains(type)) {
            ctx.getEvent().error("citizen_id_type_not_accepted");
            String error = verifiedStepUp && type.isContact() ? "c360VerifyNeedsGovernmentId" : "c360WrongIdType";
            ctx.challenge(form(ctx, raw)
                    .setError(error, policy.portalName(), policy.acceptedPhrase(), type.label())
                    .createForm(TEMPLATE));
            return;
        }

        ResolverClient.Resolution r = resolver.resolve(type.name(), value);
        switch (r.outcome()) {
            case UNAVAILABLE -> {
                ctx.getEvent().error("citizen360_unavailable");
                ctx.challenge(form(ctx, raw).setError("c360TryAgain").createForm(TEMPLATE));
                return;
            }
            case SHARED_CONTACT -> {
                ctx.getEvent().error("citizen_shared_contact");
                ctx.challenge(form(ctx, raw).setError("c360SharedContact", type.label()).createForm(TEMPLATE));
                return;
            }
            case CONFLICT -> {
                LOG.warnf("Login refused: %s has %d active owners in Citizen 360", type, r.owners());
                ctx.getEvent().error("citizen_id_conflict");
                ctx.challenge(form(ctx, raw).setError("c360IdConflict", type.label()).createForm(TEMPLATE));
                return;
            }
            case NOT_FOUND, INACTIVE -> {
                invalidCredentials(ctx, raw, null);
                return;
            }
            case FOUND -> {
                // continue below
            }
        }

        RealmModel realm = ctx.getRealm();
        UserModel user = ctx.getSession().users().getUserByUsername(realm, r.cid());
        if (user == null) {
            // Person exists in Citizen 360 but has not claimed an account yet. Same message as a wrong password.
            invalidCredentials(ctx, raw, null);
            return;
        }

        UserModel already = ctx.getUser();
        if (already != null && !already.getId().equals(user.getId())) {
            if (verifiedStepUp) {
                // Confirming the signed-in person with someone else's ID: don't reveal that the ID exists.
                invalidCredentials(ctx, raw, already);
                return;
            }
            ctx.getEvent().user(already).error(Errors.DIFFERENT_USER_AUTHENTICATED);
            ctx.challenge(form(ctx, raw).setError("c360DifferentAccount").createForm(TEMPLATE));
            return;
        }

        AuthenticationSessionModel authSession = ctx.getAuthenticationSession();
        // Lets Keycloak's brute-force detector count failures against this account.
        authSession.setAuthNote(AbstractUsernameFormAuthenticator.ATTEMPTED_USERNAME, user.getUsername());

        String bruteForceError = AuthenticatorUtils.getDisabledByBruteForceEventError(ctx, user);
        if (bruteForceError != null) {
            ctx.getEvent().user(user).error(bruteForceError);
            ctx.forceChallenge(form(ctx, raw).setError("c360InvalidCredentials").createForm(TEMPLATE));
            return;
        }
        if (!user.isEnabled()) {
            ctx.getEvent().user(user).error(Errors.USER_DISABLED);
            ctx.forceChallenge(form(ctx, raw).setError("c360AccountDisabled").createForm(TEMPLATE));
            return;
        }
        if (!user.credentialManager().isValid(UserCredentialModel.password(password))) {
            invalidCredentials(ctx, raw, user);
            return;
        }

        ctx.setUser(user);
        authSession.setAuthNote(NOTE_ID_TYPE, type.name());
        authSession.setUserSessionNote(NOTE_ID_TYPE, type.name());
        if (r.loa() != null) authSession.setUserSessionNote(NOTE_PERSON_LOA, r.loa());
        ctx.success();
    }

    /** True when this login, or the SSO session it continues, used a government ID (not an email). */
    private boolean establishedWithGovernmentId(AuthenticationFlowContext ctx) {
        if (isGovernmentId(ctx.getAuthenticationSession().getAuthNote(NOTE_ID_TYPE))) return true;
        UserSessionModel us = Sessions.existing(ctx);
        return us != null && ctx.getUser() != null
                && us.getUser().getId().equals(ctx.getUser().getId())
                && isGovernmentId(us.getNote(NOTE_ID_TYPE));
    }

    private static boolean isGovernmentId(String typeName) {
        if (typeName == null) return false;
        try {
            return !IdType.valueOf(typeName).isContact();
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private PortalPolicy policy(AuthenticationFlowContext ctx) {
        PortalPolicy p = PortalPolicy.of(ctx);
        return verifiedStepUp ? p.governmentIdsOnly() : p;
    }

    private void invalidCredentials(AuthenticationFlowContext ctx, String raw, UserModel user) {
        if (user == null) {
            // Spend the same time as a password check so response timing doesn't reveal unknown IDs.
            AuthenticatorUtils.dummyHash(ctx);
            ctx.getEvent().error(Errors.USER_NOT_FOUND);
        } else {
            ctx.getEvent().user(user).error(Errors.INVALID_USER_CREDENTIALS);
        }
        Response challenge = form(ctx, raw).setError("c360InvalidCredentials").createForm(TEMPLATE);
        ctx.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, challenge);
    }

    private LoginFormsProvider form(AuthenticationFlowContext ctx, String identifier) {
        PortalPolicy policy = policy(ctx);
        return ctx.form()
                .setAttribute("c360StepUp", verifiedStepUp)
                .setAttribute("c360Portal", policy.portalName())
                .setAttribute("c360IdLabel", policy.label())
                .setAttribute("c360Chips", policy.chips())
                .setAttribute("c360Hints", policy.hints())
                .setAttribute("c360Identifier", identifier == null ? "" : identifier.trim());
    }

    @Override
    public boolean requiresUser() {
        return verifiedStepUp;
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
