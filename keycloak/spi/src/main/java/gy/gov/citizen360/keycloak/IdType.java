package gy.gov.citizen360.keycloak;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Government ID types the identifier-first form understands.
 *
 * The formats are the POC's synthetic formats and are deliberately distinct, so
 * the authenticator can tell what kind of ID the user typed. That is how a
 * passport number typed into the NIS portal is recognised and rejected with a
 * clear message instead of a generic "not found". The Resolver applies the
 * same normalisation (see resolver/src/ids.ts); keep the two in step.
 */
public enum IdType {
    NIS("NIS number", "7 digits", "^\\d{7}$"),
    NATIONAL_ID("national ID number", "9 digits", "^\\d{9}$"),
    PASSPORT("passport number", "R and 7 digits", "^R\\d{7}$"),
    DL("driver’s licence number", "DL and 6 digits", "^DL\\d{6}$"),
    EID("EID", "EID and 8 digits", "^EID\\d{8}$"),
    GRO_BIRTH("GRO birth registration number", "B, the year and 6 digits", "^B\\d{10}$"),
    EMAIL("email address", "name@example.org", "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final String label;
    private final String format;
    private final Pattern pattern;

    IdType(String label, String format, String regex) {
        this.label = label;
        this.format = format;
        this.pattern = Pattern.compile(regex);
    }

    public String label() {
        return label;
    }

    public String format() {
        return format;
    }

    /** A contact detail rather than a government ID: may be shared, and only reaches Basic assurance. */
    public boolean isContact() {
        return this == EMAIL;
    }

    /** Upper case with spaces, dashes, dots and slashes removed; emails are lower-cased instead. */
    public static String normalise(String raw) {
        if (raw == null) return "";
        String t = raw.trim();
        if (t.contains("@")) return t.toLowerCase(Locale.ROOT);
        return t.toUpperCase(Locale.ROOT).replaceAll("[\\s\\-./]", "");
    }

    public static Optional<IdType> detect(String normalised) {
        for (IdType t : values()) {
            if (t.pattern.matcher(normalised).matches()) return Optional.of(t);
        }
        return Optional.empty();
    }

    /** Parses "NIS, EID" into types, ignoring unknown names. */
    public static List<IdType> parseList(String csv) {
        List<IdType> out = new ArrayList<>();
        if (csv == null) return out;
        for (String part : csv.split("[,\\s]+")) {
            if (part.isBlank()) continue;
            try {
                IdType t = IdType.valueOf(part.trim().toUpperCase(Locale.ROOT));
                if (!out.contains(t)) out.add(t);
            } catch (IllegalArgumentException ignored) {
                // unknown type name in config: skip it rather than break login
            }
        }
        return out;
    }

    public static String capitalise(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
