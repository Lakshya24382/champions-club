// The ONE place to tell staff something happened.
// Today it logs to the server console. To send real alerts later, call an email
// (Resend / SES), WhatsApp Business or Slack API from here. Nothing else changes.
export function notifyStaff(event, payload) {
  console.log(`[notify] ${event}`, JSON.stringify(payload));
}
