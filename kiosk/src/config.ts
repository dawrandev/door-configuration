/**
 * Deployment settings. These are the values that differ between the showroom
 * floor and a developer's laptop, and between one branch and the next.
 *
 * SPEC §12 puts zero backend on the kiosk: it is a static SPA plus a catalog
 * bundle on local disk. So this is baked at build time rather than fetched —
 * there is nothing to fetch it from.
 */

/**
 * Which branch this kiosk stands in. Rides on every lead (SPEC §6) so that when
 * there is more than one showroom we can already tell them apart, rather than
 * discovering the field is missing after a year of leads.
 */
export const SHOWROOM = import.meta.env.VITE_SHOWROOM ?? 'nukus-1';
