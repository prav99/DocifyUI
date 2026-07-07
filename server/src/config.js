// ---------------------------------------------------------------------------
// Server-side application config. Reads from process.env (loaded by env.js,
// which must be imported before this module). Keep this as the single place
// the backend resolves the support address so routes and mailers never
// hardcode it.
// ---------------------------------------------------------------------------

// Where customer contact-form messages are delivered.
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@docifydocai.com';
