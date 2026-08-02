import posthog from 'posthog-js';

const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

const PII_PROPERTIES = new Set([
  'email', '$email', 'email_address',
  'name', '$name', 'full_name', 'first_name', 'last_name', 'username',
  'phone', 'company', 'avatar', 'avatar_url', 'picture',
]);

if (!key) {
  if (import.meta.env.DEV) {
    console.error('VITE_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_KEY is configured');
  }
} else {
  posthog.init(key, {
    api_host: host || 'https://us.i.posthog.com',
    defaults: '2026-05-30',
    capture_pageview: false, // managed manually in the Analytics component
    // Customer documentation is rendered throughout the app, so never let the
    // analytics SDK harvest on-screen text, inputs, or session recordings.
    autocapture: false,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    person_profiles: 'identified_only',
    // Auth and invite links carry identifiers in the query string; strip them
    // (along with the ad-network click IDs) before any URL is recorded.
    mask_personal_data_properties: true,
    custom_personal_data_properties: ['email', 'token', 'code', 'state', 'invite', 'otp'],
    // Identifiers stay in the analytics store; contact details do not. Applies
    // to person properties too, so identify() cannot smuggle an email through.
    before_send: (event) => {
      if (!event) return event;
      for (const bag of [event.properties, event.$set, event.$set_once]) {
        if (!bag) continue;
        for (const prop of Object.keys(bag)) {
          if (PII_PROPERTIES.has(prop.toLowerCase())) delete bag[prop];
        }
      }
      return event;
    },
  });
}

export default posthog;
