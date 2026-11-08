package gy.gov.citizen360.keycloak;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.List;

public class EidStepUpAuthenticatorFactory implements AuthenticatorFactory {

    public static final String ID = "citizen-eid-step-up";

    private ResolverClient resolver;

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDisplayType() {
        return "Citizen 360 EID step-up";
    }

    @Override
    public String getReferenceCategory() {
        return "eid";
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
        return "Raises an existing session to High assurance with the EID. Passes silently when the session "
                + "was established with the EID; shows a 'link or enrol your EID' page when the person has none.";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return List.of();
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return new EidStepUpAuthenticator(resolver);
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
