// ID types and formats. Must match keycloak/spi/.../IdType.java.

export const ID_TYPES = ["NIS", "NATIONAL_ID", "PASSPORT", "DL", "EID", "GRO_BIRTH", "EMAIL", "PHONE"] as const;
export type IdType = (typeof ID_TYPES)[number];

// Contact details can be shared (a family email); they are never login IDs and never "conflicts".
export const SHARED_TYPES: ReadonlySet<IdType> = new Set<IdType>(["EMAIL", "PHONE"]);

const FORMATS: Partial<Record<IdType, RegExp>> = {
  NIS: /^\d{7}$/,
  NATIONAL_ID: /^\d{9}$/,
  PASSPORT: /^R\d{7}$/,
  DL: /^DL\d{6}$/,
  EID: /^EID\d{8}$/,
  GRO_BIRTH: /^B\d{10}$/,
  EMAIL: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  PHONE: /^\+?\d{7,15}$/,
};

export function isIdType(t: string): t is IdType {
  return (ID_TYPES as readonly string[]).includes(t);
}

/** Upper case, no spaces, dashes, dots or slashes. Emails are lower-cased instead. */
export function normalise(type: IdType | string, raw: string): string {
  const t = raw.trim();
  if (type === "EMAIL" || t.includes("@")) return t.toLowerCase();
  return t.toUpperCase().replace(/[\s\-./]/g, "");
}

export function matchesFormat(type: IdType, value: string): boolean {
  const re = FORMATS[type];
  return re ? re.test(value) : true;
}
