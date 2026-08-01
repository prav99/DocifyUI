import posthog from 'posthog-js';

const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

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
  });
}

export default posthog;
