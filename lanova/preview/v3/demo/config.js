/**
 * "Request a pilot" destination. Deliberately EMPTY: no contact address is invented.
 * To enable the button, set `contact` to a verified destination you control, for example
 *   contact: 'mailto:pilots@your-domain.example'   or   contact: 'https://your-domain.example/pilot'
 * Only mailto: and https: values are accepted (see pilotTarget). No form data is sent anywhere by LANOVA;
 * the button only opens the visitor's own email client or your page.
 */
export const PILOT = {contact: null, organisation: 'LANOVA Sports'};

export function pilotTarget(cfg = PILOT) {
  const c = typeof cfg.contact === 'string' ? cfg.contact.trim() : '';
  if (/^mailto:[^\s@<>"]+@[^\s@<>".]+\.[^\s@<>"]+$/i.test(c)) {
    const body = encodeURIComponent('Club:\nRole:\nWhat we would like to test:\n\n(Sent from the LANOVA demo. No scenario data is attached.)');
    return {ok: true, kind: 'email', href: `${c}?subject=${encodeURIComponent('LANOVA pilot request')}&body=${body}`};
  }
  if (/^https:\/\/[^\s<>"]+$/i.test(c)) return {ok: true, kind: 'link', href: c};
  return {ok: false, reason: c ? 'The configured contact is not a valid mailto: or https: address.' : 'No pilot contact has been configured yet.'};
}
