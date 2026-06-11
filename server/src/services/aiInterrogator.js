/**
 * Adaptive forensic assessment engine.
 *
 * Ollama is used when available on localhost so reasoning stays free and
 * local-first. If Ollama is not running, or it replies in the wrong script,
 * the server falls back to localized adaptive prompts.
 */

const MAX_SUBJECT_RESPONSES = Number(process.env.MAX_INTERROGATION_RESPONSES || 8)
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b'
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 9000)

const LANGUAGE_PROFILES = {
  en: {
    label: 'English',
    bcp47: 'en-IN',
    instruction: 'English',
    defaultCue: 'that moment',
    scriptPattern: /[A-Za-z]/,
    opening: ({ charge, subjectName }) =>
      `This is a formal psychological assessment for ${subjectName}. The case category is ${charge}. I am not here to force a confession; I am here to understand your thinking, emotions, and decisions. Answer carefully and honestly. In this moment, what thought keeps returning to you?`,
    probes: [
      ({ cue }) => `You used the phrase "${cue}". Slow that moment down for me. What feeling was underneath it?`,
      ({ charge }) => `When you think about this ${charge} case, which part of your story feels hardest to say plainly?`,
      ({ cue }) => `If I pause on "${cue}", what memory or image comes up first? Describe it without correcting yourself.`,
      () => 'What did you need most in the days before this incident, and how did that need shape your choices?',
      () => 'Tell me the part of this situation that you keep explaining to yourself, even when no one else is asking.',
      () => 'If someone who knows you well watched this period of your life, what would they say changed in you?',
      () => 'Where do you feel the most tension between what happened and who you believe yourself to be?',
      () => 'What answer are you avoiding because saying it aloud would make the situation feel more real?',
    ],
  },
  hi: {
    label: 'Hindi',
    bcp47: 'hi-IN',
    instruction: 'Hindi written in Devanagari script',
    defaultCue: 'उस पल',
    scriptPattern: /\p{Script=Devanagari}/u,
    opening: ({ charge, subjectName }) =>
      `यह ${subjectName} के लिए एक औपचारिक मनोवैज्ञानिक आकलन है। मामला ${charge} श्रेणी से जुड़ा है। मैं जबरन स्वीकारोक्ति नहीं चाहता; मैं आपकी सोच, भावनाओं और फैसलों को समझना चाहता हूं। ध्यान से और ईमानदारी से जवाब दें। इस समय आपके मन में बार-बार कौन सा विचार लौट रहा है?`,
    probes: [
      ({ cue }) => `आपने "${cue}" कहा। उस पल को थोड़ा धीमा करके बताइए: उसके पीछे कौन सी भावना थी?`,
      ({ charge }) => `${charge} मामले के बारे में सोचते समय, आपकी कहानी का कौन सा हिस्सा साफ-साफ कहना सबसे कठिन लगता है?`,
      ({ cue }) => `अगर मैं "${cue}" पर रुकूं, तो सबसे पहले कौन सी याद या तस्वीर सामने आती है? बिना सुधार किए बताइए।`,
      () => 'इस घटना से पहले के दिनों में आपको सबसे ज्यादा किस चीज की जरूरत थी, और उस जरूरत ने आपके फैसलों को कैसे बदला?',
      () => 'इस स्थिति का वह हिस्सा बताइए जिसे आप खुद को बार-बार समझाते हैं, भले ही कोई और न पूछ रहा हो।',
      () => 'अगर कोई करीबी व्यक्ति आपके जीवन के इस दौर को देखता, तो वह आपमें क्या बदलाव बताता?',
      () => 'जो हुआ और आप खुद को जैसा मानते हैं, उनके बीच सबसे ज्यादा तनाव आपको कहां महसूस होता है?',
      () => 'कौन सा जवाब आप इसलिए टाल रहे हैं क्योंकि उसे बोलने से यह स्थिति और वास्तविक लगने लगेगी?',
    ],
  },
  kn: {
    label: 'Kannada',
    bcp47: 'kn-IN',
    instruction: 'Kannada script',
    defaultCue: 'ಆ ಕ್ಷಣ',
    scriptPattern: /\p{Script=Kannada}/u,
    opening: ({ charge, subjectName }) =>
      `ಇದು ${subjectName}ಗಾಗಿ ಅಧಿಕೃತ ಮನೋವೈಜ್ಞಾನಿಕ ಮೌಲ್ಯಮಾಪನ. ಪ್ರಕರಣದ ವರ್ಗ ${charge}. ನಾನು ಒಪ್ಪಿಗೆ ಒತ್ತಾಯಿಸಲು ಇಲ್ಲ; ನಿಮ್ಮ ಚಿಂತನೆ, ಭಾವನೆಗಳು ಮತ್ತು ನಿರ್ಧಾರಗಳನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಇಲ್ಲಿದ್ದೇನೆ. ಗಮನದಿಂದ ಮತ್ತು ಪ್ರಾಮಾಣಿಕವಾಗಿ ಉತ್ತರಿಸಿ. ಈ ಕ್ಷಣದಲ್ಲಿ ನಿಮ್ಮ ಮನಸ್ಸಿಗೆ ಮತ್ತೆ ಮತ್ತೆ ಬರುತ್ತಿರುವ ಒಂದೇ ಆಲೋಚನೆ ಯಾವುದು?`,
    probes: [
      ({ cue }) => `ನೀವು "${cue}" ಎಂದು ಹೇಳಿದಿರಿ. ಆ ಕ್ಷಣವನ್ನು ನಿಧಾನವಾಗಿ ವಿವರಿಸಿ: ಅದರ ಹಿಂದೆ ಯಾವ ಭಾವನೆ ಇತ್ತು?`,
      ({ charge }) => `${charge} ಪ್ರಕರಣವನ್ನು ನೆನಸಿದಾಗ, ನಿಮ್ಮ ಕಥೆಯ ಯಾವ ಭಾಗವನ್ನು ನೇರವಾಗಿ ಹೇಳುವುದು ಕಷ್ಟವಾಗುತ್ತದೆ?`,
      ({ cue }) => `ನಾನು "${cue}" ಬಳಿ ನಿಲ್ಲಿಸಿದರೆ, ಮೊದಲು ಯಾವ ನೆನಪು ಅಥವಾ ಚಿತ್ರ ಬರುತ್ತದೆ? ತಿದ್ದದೆ ವಿವರಿಸಿ.`,
      () => 'ಈ ಘಟನೆಗೆ ಮುಂಚಿನ ದಿನಗಳಲ್ಲಿ ನಿಮಗೆ ಅತ್ಯಂತ ಬೇಕಾಗಿದ್ದದ್ದು ಏನು, ಮತ್ತು ಆ ಅಗತ್ಯ ನಿಮ್ಮ ಆಯ್ಕೆಗಳನ್ನು ಹೇಗೆ ಪ್ರಭಾವಿಸಿತು?',
      () => 'ಯಾರೂ ಕೇಳದಿದ್ದರೂ ನೀವು ನಿಮ್ಮೊಳಗೆ ಮತ್ತೆ ಮತ್ತೆ ವಿವರಿಸಿಕೊಳ್ಳುವ ಈ ಪರಿಸ್ಥಿತಿಯ ಭಾಗ ಯಾವುದು?',
      () => 'ನಿಮ್ಮನ್ನು ಚೆನ್ನಾಗಿ ತಿಳಿದಿರುವವರು ಈ ಅವಧಿಯನ್ನು ನೋಡಿದ್ದರೆ, ನಿಮ್ಮಲ್ಲಿ ಏನು ಬದಲಾಗಿದೆ ಎಂದು ಹೇಳುತ್ತಿದ್ದರು?',
      () => 'ನಡೆದದ್ದು ಮತ್ತು ನೀವು ನಿಮ್ಮನ್ನು ಹೇಗೆ ಕಾಣುತ್ತೀರಿ ಎಂಬುದರ ನಡುವೆ ದೊಡ್ಡ ಒತ್ತಡ ನಿಮಗೆ ಎಲ್ಲಿದೆ?',
      () => 'ಯಾವ ಉತ್ತರವನ್ನು ನೀವು ತಪ್ಪಿಸುತ್ತಿದ್ದೀರಿ, ಏಕೆಂದರೆ ಅದನ್ನು ಜೋರಾಗಿ ಹೇಳಿದರೆ ಪರಿಸ್ಥಿತಿ ಹೆಚ್ಚು ನಿಜವಾಗುತ್ತದೆ?',
    ],
  },
  te: {
    label: 'Telugu',
    bcp47: 'te-IN',
    instruction: 'Telugu script',
    defaultCue: 'ఆ క్షణం',
    scriptPattern: /\p{Script=Telugu}/u,
    opening: ({ charge, subjectName }) =>
      `ఇది ${subjectName} కోసం అధికారిక మానసిక అంచనా. కేసు వర్గం ${charge}. నేను బలవంతపు ఒప్పుకోలు కోసం ఇక్కడ లేను; మీ ఆలోచనలు, భావాలు మరియు నిర్ణయాలను అర్థం చేసుకోవడానికి ఉన్నాను. జాగ్రత్తగా, నిజాయితీగా సమాధానం చెప్పండి. ఈ క్షణంలో మీ మనసుకు మళ్లీ మళ్లీ వస్తున్న ఒక ఆలోచన ఏమిటి?`,
    probes: [
      ({ cue }) => `మీరు "${cue}" అన్నారు. ఆ క్షణాన్ని నెమ్మదిగా వివరించండి: దాని వెనుక ఉన్న భావం ఏమిటి?`,
      ({ charge }) => `${charge} కేసు గురించి ఆలోచించినప్పుడు, మీ కథలో స్పష్టంగా చెప్పడం కష్టమైన భాగం ఏది?`,
      ({ cue }) => `నేను "${cue}" వద్ద ఆగితే, మొదట గుర్తుకు వచ్చే జ్ఞాపకం లేదా దృశ్యం ఏది? దాన్ని సరిదిద్దకుండా వివరించండి.`,
      () => 'ఈ ఘటనకు ముందు రోజులలో మీకు అత్యంత అవసరమైనది ఏమిటి, ఆ అవసరం మీ నిర్ణయాలను ఎలా ప్రభావితం చేసింది?',
      () => 'ఎవరూ అడగకపోయినా మీరు మీలో మీరే మళ్లీ మళ్లీ వివరించుకుంటున్న ఈ పరిస్థితిలోని భాగం ఏది?',
      () => 'మిమ్మల్ని బాగా తెలిసిన వ్యక్తి ఈ కాలాన్ని చూసి ఉంటే, మీలో ఏమి మారిందని చెప్పేవారు?',
      () => 'జరిగినది మరియు మీరు మిమ్మల్ని ఎలా భావిస్తారో వాటి మధ్య ఎక్కువ ఉద్రిక్తత మీకు ఎక్కడ అనిపిస్తుంది?',
      () => 'ఏ సమాధానాన్ని మీరు తప్పించుకుంటున్నారు, ఎందుకంటే దాన్ని బహిరంగంగా చెప్పడం పరిస్థితిని ఇంకా నిజంగా అనిపింపజేస్తుంది?',
    ],
  },
  ta: {
    label: 'Tamil',
    bcp47: 'ta-IN',
    instruction: 'Tamil script',
    defaultCue: 'அந்த தருணம்',
    scriptPattern: /\p{Script=Tamil}/u,
    opening: ({ charge, subjectName }) =>
      `இது ${subjectName}க்கான அதிகாரப்பூர்வ உளவியல் மதிப்பீடு. வழக்கு ${charge} வகையைச் சேர்ந்தது. கட்டாய ஒப்புதல் பெற நான் இங்கு இல்லை; உங்கள் சிந்தனை, உணர்வுகள் மற்றும் முடிவுகளைப் புரிந்துகொள்ள வந்துள்ளேன். கவனமாகவும் நேர்மையாகவும் பதில் சொல்லுங்கள். இந்த நொடியில் உங்கள் மனதில் மீண்டும் மீண்டும் வரும் ஒரே சிந்தனை என்ன?`,
    probes: [
      ({ cue }) => `நீங்கள் "${cue}" என்றீர்கள். அந்த தருணத்தை மெதுவாக விளக்குங்கள்: அதன் கீழிருந்த உணர்வு என்ன?`,
      ({ charge }) => `${charge} வழக்கைப் பற்றி நினைக்கும் போது, உங்கள் கதையின் எந்த பகுதியை தெளிவாகச் சொல்லுவது கடினமாக இருக்கிறது?`,
      ({ cue }) => `நான் "${cue}" என்பதில் நின்றால், முதலில் வரும் நினைவு அல்லது படம் என்ன? திருத்தாமல் விவரியுங்கள்.`,
      () => 'இந்த சம்பவத்திற்கு முன் நாட்களில் உங்களுக்கு மிகவும் தேவையானது என்ன, அந்த தேவை உங்கள் தேர்வுகளை எப்படி மாற்றியது?',
      () => 'யாரும் கேட்காதபோதும், நீங்கள் உங்களுக்கே மீண்டும் மீண்டும் விளக்கிக்கொண்டிருக்கும் இந்த நிலையின் பகுதி எது?',
      () => 'உங்களை நன்றாக அறிந்த ஒருவர் இந்த காலத்தைப் பார்த்திருந்தால், உங்களில் என்ன மாறியது என்று சொல்வார்?',
      () => 'நடைபெற்றது மற்றும் நீங்கள் உங்களைப் பற்றி நம்புவது இவற்றின் இடையில் அதிக அழுத்தம் எங்கு உணர்கிறீர்கள்?',
      () => 'எந்த பதிலை நீங்கள் தவிர்க்கிறீர்கள், ஏனெனில் அதை வெளிப்படையாகச் சொன்னால் நிலைமை இன்னும் உண்மையாக உணரப்படும்?',
    ],
  },
}

const STRESS_PATTERNS = [
  { pattern: /\b(i don'?t know|can'?t remember|i forget|don'?t recall|no idea)\b/i, severity: 'medium', label: 'Memory evasion' },
  { pattern: /(मुझे याद नहीं|याद नहीं|पता नहीं|मालूम नहीं|नहीं पता|भूल गया|ಗೊತ್ತಿಲ್ಲ|ನೆನಪಿಲ್ಲ|ತಿಳಿದಿಲ್ಲ|ನೆನಪಾಗುತ್ತಿಲ್ಲ|తెలియదు|గుర్తు లేదు|మర్చిపోయాను|தெரியாது|நினைவில் இல்லை|ஞாபகம் இல்லை|மறந்துவிட்டேன்)/iu, severity: 'medium', label: 'Memory evasion' },
  { pattern: /\b(you'?re wrong|that'?s a lie|i never said|that'?s not true)\b/i, severity: 'high', label: 'Defensive deflection' },
  { pattern: /(झूठ|गलत|मैंने नहीं कहा|सच नहीं|ऐसा नहीं|ಸುಳ್ಳು|ತಪ್ಪು|ನಾನು ಹೇಳಿಲ್ಲ|ಸತ್ಯವಲ್ಲ|అబద్ధం|తప్పు|నేను చెప్పలేదు|నిజం కాదు|பொய்|தவறு|நான் சொல்லவில்லை|உண்மை இல்லை)/iu, severity: 'high', label: 'Defensive deflection' },
  { pattern: /\b(lawyer|attorney|counsel|fifth|not answering|no comment)\b/i, severity: 'low', label: 'Legal invocation' },
  { pattern: /(वकील|जवाब नहीं|टिप्पणी नहीं|ವಕೀಲ|ಉತ್ತರಿಸುವುದಿಲ್ಲ|ಹೇಳುವುದಿಲ್ಲ|న్యాయవాది|సమాధానం చెప్పను|வழக்கறிஞர்|பதில் சொல்ல மாட்டேன்)/iu, severity: 'low', label: 'Legal invocation' },
  { pattern: /\b(hypothetically|what if|supposing|let'?s say)\b/i, severity: 'medium', label: 'Hypothetical distancing' },
  { pattern: /\b(trust me|believe me|honestly|i swear|i promise|god knows)\b/i, severity: 'medium', label: 'Credibility assertion' },
  { pattern: /(सच में|कसम|विश्वास करें|ईमानदारी|ನಂಬಿ|ಸತ್ಯವಾಗಿ|ಪ್ರಮಾಣ|నమ్మండి|నిజంగా|ప్రమాణం|நம்புங்கள்|சத்தியமாக|உண்மையாக)/iu, severity: 'medium', label: 'Credibility assertion' },
  { pattern: /\b(i was just|only trying|merely|simply|didn'?t mean to)\b/i, severity: 'low', label: 'Minimization' },
  { pattern: /(बस|सिर्फ|केवल|थोड़ा|ಸ್ವಲ್ಪ|ಮಾತ್ರ|ಕೇವಲ|కేవలం|మాత్రమే|சும்மா|மட்டும்|வெறும்)/iu, severity: 'low', label: 'Minimization' },
  { pattern: /\b(everyone does|it'?s normal|not a big deal|happens all the time)\b/i, severity: 'medium', label: 'Normalization' },
  { pattern: /\b(they made me|had no choice|forced|no option|what else could)\b/i, severity: 'high', label: 'External attribution' },
  { pattern: /(मजबूर|कोई विकल्प नहीं|दबाव|उन्होंने करवाया|ಬಲವಂತ|ಆಯ್ಕೆ ಇರಲಿಲ್ಲ|ಒತ್ತಾಯ|బలవంతం|ఎంపిక లేదు|ఒత్తిడి|கட்டாயம்|வழியில்லை|அழுத்தம்)/iu, severity: 'high', label: 'External attribution' },
  { pattern: /\b(i don'?t feel|can'?t explain|hard to describe|difficult to say)\b/i, severity: 'low', label: 'Emotional blocking' },
  { pattern: /(समझ नहीं सकता|समझ नहीं सकती|कहना मुश्किल|ವಿವರಿಸಲು ಕಷ್ಟ|ಹೇಳಲು ಕಷ್ಟ|చెప్పడం కష్టం|వివరించలేను|விளக்க முடியாது|சொல்ல கடினம்)/iu, severity: 'low', label: 'Emotional blocking' },
  { pattern: /\b(whatever|doesn'?t matter|who cares|so what|irrelevant)\b/i, severity: 'high', label: 'Dismissive detachment' },
]

const SENTIMENT_LEXICON = {
  positive: [
    'calm', 'safe', 'clear', 'honest', 'truth', 'sorry', 'help', 'cooperate',
    'शांत', 'सच', 'मदद', 'सहयोग', 'ईमानदार',
    'ಶಾಂತ', 'ಸತ್ಯ', 'ಸಹಾಯ', 'ಸಹಕಾರ', 'ಪ್ರಾಮಾಣಿಕ',
    'శాంతి', 'నిజం', 'సహాయం', 'సహకారం', 'నిజాయితీ',
    'அமைதி', 'உண்மை', 'உதவி', 'ஒத்துழைப்பு', 'நேர்மை',
  ],
  negative: [
    'afraid', 'angry', 'panic', 'scared', 'guilty', 'pressure', 'stress', 'threat',
    'डर', 'गुस्सा', 'घबराहट', 'दबाव', 'तनाव', 'खतरा',
    'ಭಯ', 'ಕೋಪ', 'ಒತ್ತಡ', 'ತಣಿವು', 'ಆತಂಕ',
    'భయం', 'కోపం', 'ఒత్తిడి', 'టెన్షన్', 'ఆందోళన',
    'பயம்', 'கோபம்', 'அழுத்தம்', 'பதட்டம்', 'அச்சம்',
  ],
}

export function normalizeLanguage(language = 'en') {
  const key = String(language || 'en').trim().toLowerCase().slice(0, 2)
  return LANGUAGE_PROFILES[key] ? key : 'en'
}

export function analyzeResponse(text, language = 'en', context = {}) {
  const clean = String(text || '')
  const langKey = normalizeLanguage(language)
  const indicators = []
  const keywordHits = []
  let maxSeverity = 'none'
  const RANK = { none: 0, low: 1, medium: 2, high: 3 }
  for (const { pattern, severity, label } of STRESS_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(clean)) {
      if (!indicators.includes(label)) indicators.push(label)
      keywordHits.push(label)
      if (RANK[severity] > RANK[maxSeverity]) maxSeverity = severity
    }
  }

  const sentiment = analyzeSentiment(clean)
  if (sentiment.label === 'negative' && Math.abs(sentiment.score) >= 2) {
    indicators.push('Negative affect language')
    if (RANK.medium > RANK[maxSeverity]) maxSeverity = 'medium'
  }

  const voiceStress = clamp01(Number(context.voiceMetrics?.stressScore || context.voiceMetrics?.strainScore || 0))
  const behaviorStress = clamp01(Number(context.behaviorMetrics?.stressScore || context.behaviorMetrics?.agitationScore || 0))

  if (voiceStress >= 0.7) {
    indicators.push('Voice strain elevation')
    if (RANK.medium > RANK[maxSeverity]) maxSeverity = 'medium'
  }
  if (behaviorStress >= 0.7) {
    indicators.push('Behavioral agitation elevation')
    if (RANK.medium > RANK[maxSeverity]) maxSeverity = 'medium'
  }

  const linguisticWeight = RANK[maxSeverity] / RANK.high
  const sentimentWeight = Math.min(1, Math.abs(sentiment.score) / 5)
  const forensicScore = Math.round(clamp01(
    linguisticWeight * 0.45 +
    voiceStress * 0.25 +
    behaviorStress * 0.2 +
    sentimentWeight * 0.1
  ) * 100)

  const severity = maxSeverity === 'none'
    ? forensicScore >= 70 ? 'high' : forensicScore >= 45 ? 'medium' : forensicScore >= 25 ? 'low' : 'none'
    : maxSeverity

  return {
    stressFlag: indicators.length > 0 || forensicScore >= 45,
    severity,
    indicators,
    keywordHits,
    sentiment,
    language: langKey,
    voiceStress,
    behaviorStress,
    forensicScore,
  }
}

export async function getOpeningStatement({ charge, subjectName, language = 'en' }) {
  const langKey = normalizeLanguage(language)
  const profile = LANGUAGE_PROFILES[langKey]

  const aiText = await getLocalModelText({
    language: langKey,
    mode: 'opening',
    charge,
    subjectName,
    transcript: [],
    lastResponse: '',
  })

  return aiText || profile.opening({ charge, subjectName })
}

export async function getNextQuestion({ charge, subjectName, transcript, lastResponse, language = 'en' }) {
  const subjectResponses = transcript.filter(t => t.speaker === 'SUBJECT').length
  if (subjectResponses >= MAX_SUBJECT_RESPONSES) return null

  const langKey = normalizeLanguage(language)
  const aiText = await getLocalModelText({
    language: langKey,
    mode: 'followup',
    charge,
    subjectName,
    transcript,
    lastResponse,
  })

  if (aiText) return aiText
  return getLocalAdaptiveQuestion({ charge, transcript, lastResponse, language: langKey })
}

async function getLocalModelText({ language, mode, charge, subjectName, transcript, lastResponse }) {
  if (process.env.DISABLE_OLLAMA === '1') return null
  const profile = LANGUAGE_PROFILES[language]
  const previousQuestions = transcript
    .filter(t => t.speaker === 'INTERROGATOR')
    .map(t => t.text)
    .slice(-8)

  const task = mode === 'opening'
    ? `Create one opening assessment prompt for subject ${subjectName}.`
    : 'Create the next follow-up question based on the latest subject response.'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)
  const prompt = [
    'You are an adaptive forensic psychology assessment interviewer.',
    'Stay calm, clinical, non-coercive, scenario-focused, and evidence-oriented.',
    `Write only in ${profile.instruction}. Do not include an English translation.`,
    'Ask exactly one question or opening prompt. No bullet points. No markdown.',
    'Do not repeat earlier questions. Use the subject response and case context.',
    'Keep it under 55 words.',
    '',
    JSON.stringify({
      task,
      caseCategory: charge,
      subjectName,
      lastResponse,
      previousQuestions,
      recentTranscript: transcript.slice(-8).map(t => ({
        speaker: t.speaker,
        text: t.text,
      })),
    }),
  ].join('\n')

  try {
    const res = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.82,
          num_predict: 160,
        },
      }),
    })

    if (!res.ok) {
      console.warn(`Ollama request failed: ${res.status} ${await res.text().catch(() => '')}`)
      return null
    }

    const cleaned = cleanQuestion((await res.json()).response)
    return textMatchesLanguage(cleaned, language) ? cleaned : null
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('Ollama request failed:', err.message)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function getLocalAdaptiveQuestion({ charge, transcript, lastResponse, language }) {
  const profile = LANGUAGE_PROFILES[language]
  const cue = extractCue(lastResponse, profile.defaultCue)
  const asked = new Set(transcript.filter(t => t.speaker === 'INTERROGATOR').map(t => t.text))
  const seed = stableHash(`${charge}|${lastResponse}|${transcript.length}|${language}`)

  for (let i = 0; i < profile.probes.length; i += 1) {
    const template = profile.probes[(seed + i) % profile.probes.length]
    const candidate = template({ charge, cue })
    if (!asked.has(candidate)) return candidate
  }

  return null
}

function extractCue(text, fallback) {
  const clean = String(text || '')
    .replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(-4)
    .join(' ')
    .trim()

  return clean || fallback
}

function cleanQuestion(text) {
  const clean = String(text || '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return clean || null
}

function textMatchesLanguage(text, language) {
  if (!text) return false
  const profile = LANGUAGE_PROFILES[language] || LANGUAGE_PROFILES.en
  return profile.scriptPattern.test(text)
}

function analyzeSentiment(text) {
  const lowered = String(text || '').toLowerCase()
  const hits = { positive: [], negative: [] }

  for (const word of SENTIMENT_LEXICON.positive) {
    if (lowered.includes(word.toLowerCase())) hits.positive.push(word)
  }
  for (const word of SENTIMENT_LEXICON.negative) {
    if (lowered.includes(word.toLowerCase())) hits.negative.push(word)
  }

  const score = hits.positive.length - hits.negative.length
  const label = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral'
  return {
    label,
    score,
    positiveHits: hits.positive.slice(0, 6),
    negativeHits: hits.negative.slice(0, 6),
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function stableHash(input) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}
