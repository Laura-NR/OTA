/**
 * Injection token for the BI digest scheduler. Keep it in its own file so the
 * service and module do not import each other (the circular-import trap).
 */
export const REPORTS_SCHEDULER = 'ota:reports-scheduler';
