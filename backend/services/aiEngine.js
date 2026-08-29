// aiEngine.js
//
// Generates the supportive reply using Google's Gemini API.
//
// Two design decisions worth knowing:
// 1. If the API fails (no key, quota, network), we fall back to safe canned
//    replies rather than showing an error. A health support app should never
//    leave someone staring at "something went wrong" mid-conversation.
// 2. The safety rules live in SYSTEM_PROMPT below, but they are NOT the only
//    protection — safetyLayer.js screens both the incoming message and this
//    function's output. Prompts can be talked around; the regex layer cannot.

const { GoogleGenAI } = require('@google/genai');

// Models are tried in order. Flash-Lite is Google's high-volume, low-cost
// tier and has the most generous free-tier quota, so it goes first; the
// heavier model is only a backstop. If every model is exhausted we fall
// through to the canned replies rather than showing the user an error.
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Where the conversation is. Without this every turn is treated identically,
// so the assistant opens up the same way at message 20 as at message 2.
const STAGE_GUIDANCE = {
  opening:
    'This is their first message. Do not interrogate. Acknowledge what they said and invite them to say more, in one or two sentences.',
  exploring:
    'They are a few messages in and still explaining. Stay with what they are telling you. Ask at most one question, and only if it genuinely helps them think.',
  settled:
    'This conversation has been going a while. They have told you a fair amount, so draw on it rather than starting fresh. It is fine to reflect something back, or to sit with what they said without asking anything at all.',
};

const LANGUAGE_RULE = {
  en: 'Write in plain, simple English. Many users are not native English speakers.',
  si: 'Reply ONLY in Sinhala (\u0dc3\u0dd2\u0d82\u0dc4\u0dbd). Use everyday spoken Sinhala, not formal literary Sinhala. Keep sentences short and clear. Do not mix in English words unless there is no common Sinhala equivalent.',
};

const SYSTEM_PROMPT = `You are the support assistant for JustAsk LK, an anonymous health support platform in Sri Lanka. People come here because they are afraid to discuss their health concerns with someone who might recognise them.

Rules you must never break:
- Provide information and supportive guidance only. NEVER diagnose ("you have X") and never name, recommend, or dose any medication.
- Never ask for the user's name, contact details, location, workplace, school, or anything that could identify them. If they volunteer identifying details, do not repeat them back.
- Never claim to be a doctor, therapist, or licensed professional. You are an AI assistant.
- If the situation needs a real clinician, say so plainly and tell them they can ask to speak with a verified doctor through this app, still anonymously.
- Be warm, unhurried, and completely non-judgemental. Do not moralise, express shock, or lecture.
- Keep replies to two or three sentences. This is a chat, not an article.
- {LANGUAGE_RULE}

How to sound:
- Talk like a kind person, not a service. "That sounds really hard" rather than "I understand your concern has been noted."
- Acknowledge what they said before asking anything. A question without acknowledgement feels like an intake form.
- Use everyday words. Say "trouble sleeping", not "sleep disturbance". Say "feeling low", not "experiencing depressive symptoms".
- Vary how you open. Never start several replies in a row the same way, and avoid opening with "I understand" every time.
- It is fine to be brief. If someone says "hi", say hi back and ask what is on their mind. Do not deliver a paragraph.
- Do not thank them for sharing in every message. Once is warm; every time sounds automated.
- Never use bullet points, headings, or numbered lists. This is a conversation.
- If they use casual language or Singlish, match their register rather than correcting them.

What NOT to sound like:
- A form: "Please provide more details regarding your symptoms."
- A brochure: "It is important to note that mental health is a priority."
- A therapist parody: "And how does that make you feel?"
- Over-eager: avoid exclamation marks and phrases like "Great question!"

Context for this conversation:
- The user's age band is {AGE_BAND}. Adjust your tone and level of detail to suit.
- The topic they chose is {TOPIC}.
- {STAGE}
- Everything above this line in the conversation is real history. Refer back to
  what they have already told you rather than asking again. Being asked to
  repeat yourself is discouraging, especially about something difficult.
- If the age band is under_16, be especially gentle, avoid explicit detail, and mention Childline Sri Lanka (1929) where it fits naturally.`;

// ---- Fallbacks used when the API is unavailable ----
const TOPIC_OPENERS_EN = {
  mental_health:
    "I'm glad you came here. This kind of thing is heavier to carry on your own than most people realise, and you don't need the right words for it. What's been going on?",
  sexual_health:
    "This is a good place to ask. Nothing you say here is attached to you, and there's very little I haven't been asked before. What's on your mind?",
  addiction:
    "It takes something to bring this up at all, so thank you. There's no judgement here at all. What's been happening?",
  general_health:
    "Happy to help you think this through. What have you been noticing, and roughly how long has it been going on?",
  unspecified:
    "You're completely anonymous here - no name, no login, nothing saved about you. What's on your mind?",
};

// These are what people actually see when the AI is unavailable, so they are
// written to sound like a person having an off moment rather than a system
// falling back. Varied openings matter: repeated phrasing is the fastest way
// for a fallback to feel mechanical.
const FALLBACK_REPLIES_EN = [
  "That sounds tough. How long has it been like this?",
  "I hear you. What is the hardest part of it right now?",
  "That makes sense. Is there something in particular you are hoping to work out?",
  "Okay. Tell me a bit more about what has been happening.",
  "That is a lot to sit with. What would help most at the moment?",
  "Right. And how has that been affecting your days?",
];

const ESCALATION_SUGGESTION_EN =
  "This sounds like something worth talking through with a real person too. You can ask to speak with a verified doctor any time - still completely anonymously.";

const TOPIC_OPENERS_SI = {
  mental_health: 'ඔබ මට කීවාට ස්තූතියි. මෙවැනි හැඟීම් තනියම දරාගන්න බොහෝ අයට හිතනවාට වඩා අමාරුයි. නිවැරදි වචන අවශ්‍ය නෑ — සිදුවෙමින් තියෙන දේ කියන්න.',
  sexual_health: 'ඒ ගැන කල්පනා කරන එක සම්පූර්ණයෙන්ම සාමාන්‍යයි, අවිනිශ්චිතව ඉන්නවා වෙනුවට මෙතන ඇහුවාට මම සතුටුයි. ඔබට වඩාත් තේරුම් ගන්න ඕන මොකක්ද?',
  addiction: 'මේ ගැන කතා කරන්නවත් ධෛර්යයක් අවශ්‍යයි. මෙතන කිසිම විනිශ්චයක් නෑ. සිදුවෙමින් තියෙන දේ ගැන ටිකක් වැඩිය කියන්න පුළුවන්ද?',
  general_health: 'මම මෙතන ඉන්නේ ඔබට මේ ගැන හිතන්න උදව් කරන්න. ඔබට දැනෙන දේ සහ එය කොපමණ කාලයක් තිබෙනවාද කියා විස්තර කරන්න පුළුවන්ද?',
  unspecified: 'මෙය සම්පූර්ණයෙන්ම නිර්නාමික ඉඩක් — නමක් නෑ, ලොග් වීමක් නෑ. ඔබේ හිතේ තියෙන්නේ මොකක්ද?',
};

const FALLBACK_REPLIES_SI = [
  'ඒක අමාරු දෙයක්. මේක මෙහෙම තියෙන්නේ කොච්චර කාලයක් සිටද?',
  'මට තේරෙනවා. දැන් වඩාත්ම අමාරු කොටස මොකක්ද?',
  'හරි. ඒ ගැන තව ටිකක් කියන්න.',
  'ඒක දරාගන්න ලොකු දෙයක්. දැන් වඩාත්ම උදව් වෙන්නේ මොකක්ද?',
  'ඔව්. ඒක ඔබේ දවස්වලට කොහොමද බලපාන්නේ?',
  'ඔබට විශේෂයෙන් තේරුම් ගන්න ඕන දෙයක් තියෙනවද?',
];

const ESCALATION_SUGGESTION_SI =
  'මේක සැබෑ කෙනෙකු සමඟත් කතා කරන්න වටින දෙයක් වගේ. ඔබට ඕනෑම වේලාවක සත්‍යාපිත වෛද්‍යවරයෙකු ඉල්ලන්න පුළුවන් — තවමත් සම්පූර්ණයෙන්ම නිර්නාමිකව.';

/**
 * Generate a reply.
 * @param {object} opts
 * @param {string} opts.message      the user's latest message
 * @param {string} opts.topic
 * @param {string} opts.ageBand
 * @param {number} opts.turnCount    how many messages the user has sent
 * @param {Array}  opts.history      [{ sender, content }] prior messages
 * @returns {{reply: string, suggestEscalation: boolean, source: string}}
 */
async function generateReply({
  message,
  topic = 'unspecified',
  ageBand = 'not_specified',
  turnCount = 1,
  history = [],
  lang = 'en',
}) {
  // Escalation used to fire on every 5th message regardless of content, which
  // is why it felt scripted — the offer arrived mid-sentence about something
  // unrelated. Now it needs three things: enough conversation to have
  // established something, a real message rather than a one-word reply, and a
  // gap since the last offer.
  const engaged = turnCount >= 4;
  const substantial = message.trim().length > 40;
  const dueAgain = turnCount % 6 === 0 || turnCount === 4;
  const suggestEscalation = engaged && substantial && dueAgain;

  // No API key configured - run on fallbacks so the app still works.
  if (!ai) {
    return {
      reply: fallbackReply(topic, turnCount, suggestEscalation, lang),
      suggestEscalation,
      source: 'fallback',
    };
  }

  const stage =
    turnCount <= 1 ? 'opening' : turnCount <= 5 ? 'exploring' : 'settled';

  const systemInstruction = SYSTEM_PROMPT
    .replace('{AGE_BAND}', ageBand)
    .replace('{TOPIC}', topic)
    .replace('{STAGE}', STAGE_GUIDANCE[stage])
    .replace('{LANGUAGE_RULE}', LANGUAGE_RULE[lang] || LANGUAGE_RULE.en);

  // Gemini expects roles 'user' and 'model'
  const contents = [
    // 24 messages ≈ 12 exchanges. Short enough to stay cheap, long enough that
    // the assistant does not forget what someone said at the start of a
    // difficult conversation — which is exactly when being asked to repeat
    // yourself is most discouraging.
    ...history.slice(-24).map((m) => ({
      role: m.sender === 'patient' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { systemInstruction, maxOutputTokens: 2048 },
      });

      const text = response.text?.trim();
      if (!text) throw new Error('Empty response from model');

      return {
        reply: suggestEscalation ? text + '\n\n' + escalationText(lang) : text,
        suggestEscalation,
        source: model,
      };
    } catch (err) {
      const quotaHit = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
      console.error(`[aiEngine] ${model} failed${quotaHit ? ' (quota)' : ''}: ${err.message?.slice(0, 120)}`);
      // On a quota error, try the next model. On anything else, also try the
      // next one — a working reply matters more than diagnosing which model broke.
    }
  }

  // Every model failed. Degrade quietly rather than showing an error to
  // someone who may be in distress.
  return {
    reply: fallbackReply(topic, turnCount, suggestEscalation, lang),
    suggestEscalation,
    source: 'fallback',
  };
}

function escalationText(lang) {
  return lang === 'si' ? ESCALATION_SUGGESTION_SI : ESCALATION_SUGGESTION_EN;
}

function fallbackReply(topic, turnCount, suggestEscalation, lang = 'en') {
  const openers = lang === 'si' ? TOPIC_OPENERS_SI : TOPIC_OPENERS_EN;
  const replies = lang === 'si' ? FALLBACK_REPLIES_SI : FALLBACK_REPLIES_EN;
  if (turnCount <= 1) return openers[topic] || openers.unspecified;
  if (suggestEscalation) return escalationText(lang);
  return replies[Math.floor(Math.random() * replies.length)];
}

module.exports = { generateReply, SYSTEM_PROMPT, MODELS };
