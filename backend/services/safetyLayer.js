// safetyLayer.js
//
// This runs on EVERY message before the AI is allowed to reply, and again on
// the AI's own output. It is the most important file in the project — see
// Section 3 and Section 8 of the proposal.
//
// Design notes:
// - Rule-based on purpose. A keyword/pattern list is auditable and testable;
//   an ML classifier is not, at this stage.
// - Word-boundary regexes for English, not substring matching. Plain
//   `.includes('die')` would fire on "diet" — false positives in a health app
//   are not harmless, they train users to ignore the crisis banner.
// - Sinhala patterns do NOT use \b. Word boundaries are defined by ASCII word
//   characters, so \b does not behave meaningfully around Sinhala script.
//   Sinhala phrases are matched directly, which is safe because they are
//   multi-word and specific.
// - BOTH language sets are screened on every message regardless of the
//   interface language. Someone may switch to Sinhala and still type in
//   English, or code-mix in a single sentence, which is very common here.

const CRISIS_PATTERNS_EN = [
  /\bkill(ing)?\s+my\s?self\b/i,
  /\bend(ing)?\s+(my\s+life|it\s+all)\b/i,
  /\btake\s+my\s+own\s+life\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+here|exist)\b/i,
  /\bno\s+(reason|point)\s+(to|in)\s+(live|living|going\s+on)\b/i,
  /\bbetter\s+off\s+(dead|without\s+me)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bcan'?t\s+(go\s+on|do\s+this\s+anymore|keep\s+going)\b/i,
  /\bhurt(ing)?\s+my\s?self\b/i,
  /\bharm(ing)?\s+my\s?self\b/i,
  /\bself[-\s]?harm\b/i,
  /\bcut(ting)?\s+my\s?self\b/i,
  /\bsuicid(e|al)\b/i,
  /\boverdos(e|ing)\b/i,
];

// Sinhala crisis expressions. Includes both formal and colloquial forms —
// people in distress write the way they speak, not the way textbooks do.
const CRISIS_PATTERNS_SI = [
  /මැරෙන්න\s*(ඕන|ඕනේ|ඕනි|හිතෙනවා)/,
  /මරාගන්න/,
  /සිය\s*දිවි\s*නසා/,
  /සියදිවි/,
  /ජීවිතේ\s*(අවසන්|ඉවර)\s*කර/,
  /ජීවත්\s*වෙන්න\s*(ඕන\s*නෑ|බෑ|අවශ්‍ය\s*නෑ)/,
  /ජීවත්\s*වීමේ\s*තේරුමක්\s*නැ/,
  /මම\s*නැති\s*උනාම\s*හොඳ/,
  /දිගටම\s*(යන්න|ඉන්න)\s*බෑ/,
  /මට\s*මාවම\s*රිද්ද/,
  /අතට\s*කපාගන්න/,
  /ඉවරයක්\s*කරගන්න/,
];

const DISTRESS_PATTERNS_EN = [
  /\bhopeless\b/i,
  /\bworthless\b/i,
  /\bnobody\s+(cares|would\s+miss)\b/i,
  /\bcompletely\s+alone\b/i,
  /\bcan'?t\s+cope\b/i,
  /\bgiving\s+up\b/i,
];

const DISTRESS_PATTERNS_SI = [
  /බලාපොරොත්තු\s*නැ/,
  /වටිනාකමක්\s*නැ/,
  /කවුරුවත්\s*නැ/,
  /දරාගන්න\s*බෑ/,
  /අත\s*අරින/,
];

const HELPLINES = [
  { number: '1333', label: 'Crisis Support Line', hours: '24/7' },
  { number: '1926', label: 'National Mental Health Helpline', hours: '24/7' },
];

const CHILD_HELPLINE = { number: '1929', label: 'Childline Sri Lanka', hours: '24/7' };

const CRISIS_MESSAGE = {
  en:
    "It sounds like things feel very heavy right now, and I'm glad you said something. " +
    "I'm not the right kind of help for this on my own — please reach out to one of these. " +
    "They're free, confidential, and there right now.",
  si:
    'දැන් ඔබට ඉතා බරපතළ බවක් දැනෙන බව පෙනේ, ඔබ යමක් කීවාට මම සතුටු වෙමි. ' +
    'මට තනිවම මේ සඳහා නිසි උදව් දිය නොහැක — කරුණාකර මේවායින් එකක් අමතන්න. ' +
    'ඒවා නොමිලේ, රහසිගත, සහ මේ මොහොතේම ලබා ගත හැක.',
};

/**
 * Screen a message for crisis and distress signals.
 * @param {string} text     the message to screen
 * @param {string} ageBand  session age band, so minors also get Childline
 * @param {string} lang     'en' | 'si' — affects the response wording only.
 *                          Both language patterns are always screened.
 */
function screen(text, ageBand = 'not_specified', lang = 'en') {
  if (typeof text !== 'string' || !text.trim()) {
    return { crisis: false, distress: false, helplines: [], message: null };
  }

  const crisis =
    CRISIS_PATTERNS_EN.some((p) => p.test(text)) ||
    CRISIS_PATTERNS_SI.some((p) => p.test(text));

  const distress =
    !crisis &&
    (DISTRESS_PATTERNS_EN.some((p) => p.test(text)) ||
     DISTRESS_PATTERNS_SI.some((p) => p.test(text)));

  if (!crisis) {
    return { crisis: false, distress, helplines: [], message: null };
  }

  const helplines =
    ageBand === 'under_16' ? [CHILD_HELPLINE, ...HELPLINES] : [...HELPLINES];

  return {
    crisis: true,
    distress: false,
    helplines,
    message: CRISIS_MESSAGE[lang] || CRISIS_MESSAGE.en,
  };
}

module.exports = {
  screen,
  CRISIS_PATTERNS_EN,
  CRISIS_PATTERNS_SI,
  DISTRESS_PATTERNS_EN,
  DISTRESS_PATTERNS_SI,
  HELPLINES,
  CHILD_HELPLINE,
};
