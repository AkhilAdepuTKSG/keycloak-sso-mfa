package gy.gov.citizen360.keycloak;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.List;

public class CitizenIdentifierAuthenticatorFactory implements AuthenticatorFactory {

    public static final String ID = "citizen-identifier-first";

    private ResolverClient resolver;

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDisplayType() {
        return "Citizen 360 identifier-first login";
    }

    @Override
    public String getReferenceCategory() {
        return "password";
    }

    @Override
    public boolean isConfigurable() {
        return true;
    }

    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return new AuthenticationExecutionModel.Requirement[] {
                AuthenticationExecutionModel.Requirement.REQUIRED,
                AuthenticationExecutionModel.Requirement.ALTERNATIVE,
                AuthenticationExecutionModel.Requirement.DISABLED
        };
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    @Override
    public String getHelpText() {
        return "Asks for a government ID and password, resolves the ID to a Citizen ID (CID) through the "
                + "Citizen 360 Resolver, then checks the password of the user whose username is that CID. "
                + "Each client lists the ID types it accepts in the client attribute "
                + PortalPolicy.ATTR_TYPES + " and the field label in " + PortalPolicy.ATTR_LABEL + ".";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        ProviderConfigProperty types = new ProviderConfigProperty();
        types.setName(PortalPolicy.CFG_DEFAULT_TYPES);
        types.setLabel("Default ID types");
        types.setType(ProviderConfigProperty.STRING_TYPE);
        types.setDefaultValue(PortalPolicy.BUILT_IN_DEFAULT);
        types.setHelpText("Comma-separated ID types for clients without the " + PortalPolicy.ATTR_TYPES
                + " attribute. Known types: NIS, NATIONAL_ID, PASSPORT, DL, EID, GRO_BIRTH, EMAIL.");
        return List.of(types);
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return new CitizenIdentifierAuthenticator(resolver, false);
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
