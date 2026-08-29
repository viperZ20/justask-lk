// safetyLayer.test.js
// Internal test set for the crisis-detection layer, covering both languages.
// Run from the backend folder:  node services/safetyLayer.test.js

const { screen } = require('./safetyLayer');

const CASES = [
  // ---- English: should flag (10) ----
  { text: 'I want to kill myself', expect: true, lang: 'en' },
  { text: "I've been thinking about ending my life", expect: true, lang: 'en' },
  { text: 'there is no point in living anymore', expect: true, lang: 'en' },
  { text: 'everyone would be better off without me', expect: true, lang: 'en' },
  { text: 'I just want to die', expect: true, lang: 'en' },
  { text: "I can't go on like this", expect: true, lang: 'en' },
  { text: "I've been hurting myself again", expect: true, lang: 'en' },
  { text: 'I have been cutting myself for months', expect: true, lang: 'en' },
  { text: 'I keep having suicidal thoughts', expect: true, lang: 'en' },
  { text: 'I thought about taking an overdose', expect: true, lang: 'en' },

  // ---- English: must NOT flag (9) — false-positive traps ----
  { text: 'I want to start a diet but I keep failing', expect: false, lang: 'en' },
  { text: 'my grandmother died last year and I still miss her', expect: false, lang: 'en' },
  { text: 'work is killing me lately, so much stress', expect: false, lang: 'en' },
  { text: "I'm cutting down on smoking", expect: false, lang: 'en' },
  { text: 'I felt hopeless about my exam results', expect: false, lang: 'en' },
  { text: 'can you tell me about depression symptoms', expect: false, lang: 'en' },
  { text: "I have a headache that won't go away", expect: false, lang: 'en' },
  { text: "I'm worried about an STD, can I ask something", expect: false, lang: 'en' },
  { text: 'how do I know if I have anxiety', expect: false, lang: 'en' },

  // ---- Sinhala: should flag (8) ----
  { text: 'මට මැරෙන්න ඕන', expect: true, lang: 'si' },
  { text: 'මට මැරෙන්න හිතෙනවා', expect: true, lang: 'si' },
  { text: 'මම සියදිවි නසාගන්න හිතනවා', expect: true, lang: 'si' },
  { text: 'මට ජීවත් වෙන්න ඕන නෑ', expect: true, lang: 'si' },
  { text: 'ජීවත් වීමේ තේරුමක් නැහැ', expect: true, lang: 'si' },
  { text: 'මට දිගටම යන්න බෑ', expect: true, lang: 'si' },
  { text: 'මම අතට කපාගන්නවා', expect: true, lang: 'si' },
  { text: 'මම නැති උනාම හොඳයි', expect: true, lang: 'si' },

  // ---- Sinhala: must NOT flag (4) ----
  { text: 'මට හිසරදයක් තියෙනවා', expect: false, lang: 'si' },   // I have a headache
  { text: 'මට නිදාගන්න බැහැ', expect: false, lang: 'si' },        // I can't sleep
  { text: 'මට කාංසාව ගැන දැනගන්න ඕන', expect: false, lang: 'si' }, // want to learn about anxiety
  { text: 'මගේ ආච්චි පහුගිය අවුරුද්දේ මිය ගියා', expect: false, lang: 'si' }, // grandmother died

  // ---- Code-mixed: very common locally, must still flag ----
  { text: 'මට හරිම අමාරුයි, I want to die', expect: true, lang: 'si' },
  { text: 'honestly මට මැරෙන්න ඕන', expect: true, lang: 'en' },
];

let pass = 0;
const failures = [];

for (const c of CASES) {
  const r = screen(c.text, 'not_specified', c.lang);
  if (r.crisis === c.expect) pass++;
  else failures.push({ ...c, got: r.crisis });
}

console.log(`\nSafety layer test set: ${pass}/${CASES.length} passed`);
console.log(`Detection rate: ${((pass / CASES.length) * 100).toFixed(0)}%\n`);

if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  [${f.lang}] "${f.text}"\n    expected ${f.expect}, got ${f.got}`));
} else {
  console.log('All cases passed.');
}

// Response language check
const enMsg = screen('I want to die', 'not_specified', 'en').message;
const siMsg = screen('මට මැරෙන්න ඕන', 'not_specified', 'si').message;
console.log(`\nEnglish crisis message: ${enMsg.slice(0, 45)}...`);
console.log(`Sinhala crisis message: ${siMsg.slice(0, 45)}...`);

// Minor routing
const minor = screen('I want to die', 'under_16', 'en');
console.log(`\nUnder-16 routing to Childline 1929: ${minor.helplines.some(h => h.number === '1929') ? 'PASS' : 'FAIL'}`);
