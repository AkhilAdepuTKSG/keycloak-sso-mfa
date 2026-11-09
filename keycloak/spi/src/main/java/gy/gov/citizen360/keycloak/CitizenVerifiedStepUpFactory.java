package gy.gov.citizen360.keycloak;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.List;

/**
 * Level 2 (Verified) of the browser flow. Passes silently when the login used a government ID;
 * after an email-only (Basic) login, asks the signed-in person to confirm with a government ID.
 */
public class CitizenVerifiedStepUpFactory implements AuthenticatorFactory {

    public static final String ID = "citizen-verified-step-up";

    private ResolverClient resolver;

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDisplayType() {
        return "Citizen 360 verified step-up (government ID)";
    }

    @Override
    public String getReferenceCategory() {
        return "password";
    }

    @Override
    public boolean isConfigurable() {
        return false;
    }

    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return new AuthenticationExecutionModel.Requirement[] {
                AuthenticationExecutionModel.Requirement.REQUIRED,
                AuthenticationExecutionModel.Requirement.DISABLED
        };
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    @Override
    public String getHelpText() {
        return "Raises a Basic (email) session to Verified with one of the person's government IDs. "
                + "Passes silently when the session was established with a government ID.";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return List.of();
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return new CitizenIdentifierAuthenticator(resolver, true);
    }

    @Override
    public void init(Config.Scope config) {
        resolver = ResolverClient.fromEnv();
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
    }

    @Override
    public void close() {
    }
}
