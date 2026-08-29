import { createContext, useContext, useState, useCallback } from 'react';

// Sinhala needs a Unicode-complete font — Inter and DM Serif Display do not
// cover the Sinhala block. The `lang-si` class on <body> swaps the whole page
// to Noto Sans Sinhala; see index.css.

const STRINGS = {
  en: {
    // shared
    brand: 'JustAsk LK',
    anonymousSession: 'Anonymous Session',
    back: 'Back',
    sos: 'SOS',
    // age select
    step1: 'Step 1 of 2',
    ageTitle: 'How old are you?',
    ageLede: 'This helps us give the right kind of support for your age. Nothing here identifies you.',
    under16: 'Under 16', under16Note: 'For children and young teens',
    age1618: '16–18', age1618Note: 'For teens',
    age1925: '19–25', age1925Note: 'For young adults',
    age2640: '26–40', age2640Note: 'For adults',
    age40plus: '40+', age40plusNote: 'For mature adults',
    starting: 'Starting…',
    noIdentity: 'We never ask for a name, NIC, email, or phone number.',
    doctorIntent: 'You’ll be connected to a verified doctor as soon as you’re in.',
    // topic select
    step2: 'Step 2 of 2',
    topicTitle: 'What would you like to talk about?',
    topicLede: 'Choose a topic. You can talk about anything once you’re in.',
    mentalHealth: 'Mental Health', mentalNote: 'Stress, anxiety, mood',
    sexualHealth: 'Sexual Health', sexualNote: 'Questions you can’t ask',
    addiction: 'Addiction', addictionNote: 'Substance use, habits',
    generalHealth: 'General Health', generalNote: 'Anything physical',
    opening: 'Opening…',
    orJustType: 'Or just start typing →',
    privateNote: 'Your conversations are private. We don’t collect any personal data.',
    // chat
    aiGreeting: 'Hello. I’m here to listen and provide a safe space. What’s been troubling you lately?',
    aiDisclaimer: 'I am an AI, not a doctor. I provide support and guidance, not diagnoses.',
    typeAnything: 'Type anything...',
    replyToDoctor: 'Reply to the doctor…',
    typeWhileWait: 'Type while you wait…',
    consultEnded: 'This consultation has ended',
    connectedToDoctor: 'Connected to Doctor',
    waitingForDoctor: 'Waiting for a doctor',
    consultationEnded: 'Consultation ended',
    waitingTitle: 'Waiting for a verified doctor',
    waitingNote: 'You can keep typing — everything you write will be waiting for them. Your identity is never shared.',
    crisisTitle: 'Your safety is my priority',
    crisisBody: 'It sounds like you’re going through an incredibly tough time right now. You are not alone. Please reach out to someone who can help immediately.',
    call: 'Call',
    slmcVerified: 'SLMC Verified',
    verifiedDoctor: 'Verified Doctor',
    realClinician: 'Real clinician · Fully anonymous',
    connectAnon: 'Connect Anonymously',
    requesting: 'Requesting…',
    talkToDoctor: 'Talk to a verified doctor',
    // voice
    speakInstead: 'Speak instead of typing',
    stopListening: 'Stop listening',
    listening: 'Listening… speak naturally',
    listeningNote: 'Converted to text on this device — only the text is stored',
    spoken: 'spoken',
    // ending
    endChat: 'End chat',
    endChatConfirm: 'End this conversation? You can start a new one any time.',
    endChatCancel: 'Keep talking',
    endChatYes: 'End it',
    endedByYou: 'You ended this conversation.',
    endedByDoctor: 'The doctor has ended this consultation.',
    backToHome: 'Back to home',
    // referral
    referralTitle: 'Referral Information',
    clinic: 'Clinic', area: 'Area', howToBook: 'How to book',
    referralNote: 'We have not shared any of your information with this clinic. The choice to contact them is entirely yours.',
  },

  si: {
    brand: 'JustAsk LK',
    anonymousSession: 'නිර්නාමික සැසිය',
    back: 'ආපසු',
    sos: 'හදිසි',
    step1: 'පියවර 1/2',
    ageTitle: 'ඔබේ වයස කීයද?',
    ageLede: 'මෙය ඔබේ වයසට සුදුසු සහාය ලබා දීමට උපකාරී වේ. මෙහි කිසිවක් ඔබව හඳුනා නොගනී.',
    under16: '16ට අඩු', under16Note: 'ළමුන් සහ තරුණ නව යොවුන් වියේ අය සඳහා',
    age1618: '16–18', age1618Note: 'නව යොවුන් වියේ අය සඳහා',
    age1925: '19–25', age1925Note: 'තරුණ වැඩිහිටියන් සඳහා',
    age2640: '26–40', age2640Note: 'වැඩිහිටියන් සඳහා',
    age40plus: '40+', age40plusNote: 'මුහුකුරා ගිය වැඩිහිටියන් සඳහා',
    starting: 'ආරම්භ වෙමින්…',
    noIdentity: 'අපි කිසිවිටෙක නමක්, ජා.හැ.අංකයක්, විද්‍යුත් තැපෑලක් හෝ දුරකථන අංකයක් නොඉල්ලමු.',
    doctorIntent: 'ඔබ ඇතුළු වූ වහාම සත්‍යාපිත වෛද්‍යවරයෙකු සමඟ සම්බන්ධ කරනු ලැබේ.',
    step2: 'පියවර 2/2',
    topicTitle: 'ඔබට කතා කිරීමට අවශ්‍ය කුමක් ගැනද?',
    topicLede: 'මාතෘකාවක් තෝරන්න. ඇතුළු වූ පසු ඕනෑම දෙයක් ගැන කතා කළ හැක.',
    mentalHealth: 'මානසික සෞඛ්‍යය', mentalNote: 'ආතතිය, කාංසාව, මනෝභාවය',
    sexualHealth: 'ලිංගික සෞඛ්‍යය', sexualNote: 'අසන්නට බැරි ප්‍රශ්න',
    addiction: 'ඇබ්බැහිවීම', addictionNote: 'මත්ද්‍රව්‍ය භාවිතය, පුරුදු',
    generalHealth: 'සාමාන්‍ය සෞඛ්‍යය', generalNote: 'ශාරීරික ඕනෑම දෙයක්',
    opening: 'විවෘත වෙමින්…',
    orJustType: 'නැතහොත් කෙලින්ම ටයිප් කරන්න →',
    privateNote: 'ඔබේ සංවාද පෞද්ගලිකයි. අපි කිසිදු පෞද්ගලික දත්තයක් රැස් නොකරමු.',
    aiGreeting: 'ආයුබෝවන්. මම මෙහි සිටින්නේ ඔබට සවන් දීමට සහ ආරක්ෂිත ඉඩක් ලබා දීමටයි. මෑතකදී ඔබට කරදර කරන්නේ කුමක්ද?',
    aiDisclaimer: 'මම AI වන අතර වෛද්‍යවරයෙක් නොවේ. මම සහාය සහ මග පෙන්වීම ලබා දෙමි, රෝග විනිශ්චය නොවේ.',
    typeAnything: 'ඕනෑම දෙයක් ටයිප් කරන්න...',
    replyToDoctor: 'වෛද්‍යවරයාට පිළිතුරු දෙන්න…',
    typeWhileWait: 'රැඳී සිටියදී ටයිප් කරන්න…',
    consultEnded: 'මෙම උපදේශනය අවසන් වී ඇත',
    connectedToDoctor: 'වෛද්‍යවරයා සමඟ සම්බන්ධයි',
    waitingForDoctor: 'වෛද්‍යවරයෙකු එනතුරු බලා සිටී',
    consultationEnded: 'උපදේශනය අවසන්',
    waitingTitle: 'සත්‍යාපිත වෛද්‍යවරයෙකු එනතුරු බලා සිටී',
    waitingNote: 'ඔබට දිගටම ටයිප් කළ හැක — ඔබ ලියන සියල්ල ඔවුන් සඳහා රැඳී පවතී. ඔබේ අනන්‍යතාවය කිසිවිටෙක බෙදා නොගනී.',
    crisisTitle: 'ඔබේ ආරක්ෂාව මගේ ප්‍රමුඛතාවයයි',
    crisisBody: 'ඔබ දැන් ඉතා දුෂ්කර කාලයක් ගත කරන බව පෙනේ. ඔබ තනිවම නොවේ. කරුණාකර වහාම උදව් කළ හැකි කෙනෙකු අමතන්න.',
    call: 'අමතන්න',
    slmcVerified: 'SLMC සත්‍යාපිතයි',
    verifiedDoctor: 'සත්‍යාපිත වෛද්‍යවරයා',
    realClinician: 'සැබෑ වෛද්‍යවරයෙක් · සම්පූර්ණයෙන් නිර්නාමිකයි',
    connectAnon: 'නිර්නාමිකව සම්බන්ධ වන්න',
    requesting: 'ඉල්ලමින්…',
    talkToDoctor: 'සත්‍යාපිත වෛද්‍යවරයෙකු සමඟ කතා කරන්න',
    speakInstead: 'ටයිප් කරනවා වෙනුවට කතා කරන්න',
    stopListening: 'නවත්වන්න',
    listening: 'සවන් දෙමින්… ස්වාභාවිකව කතා කරන්න',
    listeningNote: 'මෙම උපාංගයේදීම පෙළට හරවනු ලැබේ — පෙළ පමණක් ගබඩා වේ',
    spoken: 'කථිතයි',
    endChat: 'සංවාදය අවසන් කරන්න',
    endChatConfirm: 'මෙම සංවාදය අවසන් කරන්නද? ඔබට ඕනෑම වේලාවක නව එකක් ආරම්භ කළ හැක.',
    endChatCancel: 'දිගටම කතා කරන්න',
    endChatYes: 'අවසන් කරන්න',
    endedByYou: 'ඔබ මෙම සංවාදය අවසන් කළා.',
    endedByDoctor: 'වෛද්‍යවරයා මෙම උපදේශනය අවසන් කර ඇත.',
    backToHome: 'මුල් පිටුවට',
    referralTitle: 'යොමු කිරීමේ තොරතුරු',
    clinic: 'සායනය', area: 'ප්‍රදේශය', howToBook: 'වෙන් කරගන්නා ආකාරය',
    referralNote: 'අපි ඔබේ කිසිදු තොරතුරක් මෙම සායනය සමඟ බෙදාගෙන නැත. ඔවුන් සම්බන්ධ කර ගැනීමේ තේරීම සම්පූර්ණයෙන්ම ඔබ සතුයි.',
  },
};

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(
    () => localStorage.getItem('jl_lang') || 'en'
  );

  const setLang = useCallback((next) => {
    setLangState(next);
    localStorage.setItem('jl_lang', next);
    document.documentElement.lang = next;
    document.body.classList.toggle('lang-si', next === 'si');
  }, []);

  const toggle = useCallback(() => setLang(lang === 'en' ? 'si' : 'en'), [lang, setLang]);

  // t('key') returns the string, falling back to English if a key is missing.
  const t = useCallback((key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key, [lang]);

  // Speech recognition locale — Sinhala is si-LK.
  const speechLang = lang === 'si' ? 'si-LK' : 'en-US';

  return (
    <LangContext.Provider value={{ lang, setLang, toggle, t, speechLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}
