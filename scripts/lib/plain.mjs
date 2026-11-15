// Text measured from a host is shown as text: terminal colour codes in a commit title (a tool
// that commits through a coloured pager writes "\x1b[38;2;…m") and other control characters
// never reach a page. The browser's copy is plain() in static/js/site.js (a visual's ctx.plain).
const SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
// eslint-disable-next-line no-control-regex
export const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_ALL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

export const plain = (text) => (typeof text === 'string'
  ? text.replace(SEQUENCE, '').replace(CONTROL_ALL, '')
  : text);
