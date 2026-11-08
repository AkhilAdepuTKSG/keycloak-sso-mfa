package gy.gov.citizen360.keycloak;

import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.ClientModel;

import java.util.ArrayList;
import java.util.List;

/**
 * Which IDs a portal (Keycloak client) accepts, and what the form calls them.
 *
 * Per-client settings live in client attributes:
 *   citizen.login.id_types = "NIS"                 (comma-separated IdType names)
 *   citizen.login.id_label = "NIS number"          (label above the ID field)
 * A client without the attribute falls back to the authenticator config
 * ("defaultIdTypes"), then to the built-in default below.
 */
public record PortalPolicy(List<IdType> allowed, String label, String portalName) {

    public static final String ATTR_TYPES = "citizen.login.id_types";
    public static final String ATTR_LABEL = "citizen.login.id_label";
    public static final String CFG_DEFAULT_TYPES = "defaultIdTypes";
    static final String BUILT_IN_DEFAULT = "NIS,NATIONAL_ID,PASSPORT,DL,EID";

    public static PortalPolicy of(AuthenticationFlowContext ctx) {
        ClientModel client = ctx.getAuthenticationSession().getClient();
        String types = client.getAttribute(ATTR_TYPES);
        if (types == null || types.isBlank()) {
            AuthenticatorConfigModel cfg = ctx.getAuthenticatorConfig();
            types = cfg != null && cfg.getConfig() != null ? cfg.getConfig().get(CFG_DEFAULT_TYPES) : null;
        }
        List<IdType> allowed = IdType.parseList(types == null || types.isBlank() ? BUILT_IN_DEFAULT : types);
        if (allowed.isEmpty()) allowed = IdType.parseList(BUILT_IN_DEFAULT);

        String label = client.getAttribute(ATTR_LABEL);
        if (label == null || label.isBlank()) label = IdType.capitalise(joinLabels(allowed));

        String name = client.getName() == null || client.getName().isBlank() ? client.getClientId() : client.getName();
        return new PortalPolicy(allowed, label, name);
    }

    /** "NIS number" for one type, "NIS number or EID" for two, "a, b or c" for more. */
    public String acceptedPhrase() {
        return joinLabels(allowed);
    }

    /** Short format hints shown under the field, one per accepted type. */
    public List<String> hints() {
        List<String> out = new ArrayList<>();
        for (IdType t : allowed) out.add(IdType.capitalise(t.label()) + ": " + t.format());
        return out;
    }

    public List<String> chips() {
        List<String> out = new ArrayList<>();
        for (IdType t : allowed) out.add(IdType.capitalise(t.label()));
        return out;
    }

    static String joinLabels(List<IdType> types) {
        List<String> labels = new ArrayList<>();
        for (IdType t : types) labels.add(t.label());
        if (labels.isEmpty()) return "";
        if (labels.size() == 1) return labels.get(0);
        return String.join(", ", labels.subList(0, labels.size() - 1)) + " or " + labels.get(labels.size() - 1);
    }
}
