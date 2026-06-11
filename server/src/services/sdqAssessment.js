const SDQ_SCALES = {
  emotional: 'Emotional symptoms',
  conduct: 'Conduct problems',
  hyperactivity: 'Hyperactivity / inattention',
  peer: 'Peer relationship problems',
  prosocial: 'Prosocial behaviour',
}

const META = [
  ['prosocial', false], ['hyperactivity', false], ['emotional', false], ['prosocial', false], ['conduct', false],
  ['peer', false], ['conduct', true], ['emotional', false], ['prosocial', false], ['hyperactivity', false],
  ['peer', true], ['conduct', false], ['emotional', false], ['peer', true], ['hyperactivity', false],
  ['emotional', false], ['prosocial', false], ['conduct', false], ['peer', false], ['prosocial', false],
  ['hyperactivity', true], ['conduct', false], ['peer', false], ['emotional', false], ['hyperactivity', true],
]

const EN_ITEMS = [
  'Considerate of other people\'s feelings.',
  'Restless, overactive, cannot stay still for long.',
  'Often complains of headaches, stomach-aches or sickness.',
  'Shares readily with other children, for example treats, toys, pencils.',
  'Often has temper tantrums or hot tempers.',
  'Rather solitary, tends to play alone.',
  'Generally obedient, usually does what adults request.',
  'Many worries, often seems worried.',
  'Helpful if someone is hurt, upset or feeling ill.',
  'Constantly fidgeting or squirming.',
  'Has at least one good friend.',
  'Often fights with other children or bullies them.',
  'Often unhappy, down-hearted or tearful.',
  'Generally liked by other children.',
  'Easily distracted, concentration wanders.',
  'Nervous or clingy in new situations, easily loses confidence.',
  'Kind to younger children.',
  'Often lies or cheats.',
  'Picked on or bullied by other children.',
  'Often volunteers to help others, such as parents, teachers, or other children.',
  'Thinks things out before acting.',
  'Steals from home, school or elsewhere.',
  'Gets on better with adults than with other children.',
  'Many fears, easily scared.',
  'Good attention span, sees work through to the end.',
]

const HI_ITEMS = [
  'अन्य लोगों की भावनाओं का लिहाज रखने वाला।',
  'बेचैन, जरूरत से ज्यादा फुर्तीला, अधिक समय तक चुपचाप नहीं बैठ सकता।',
  'अक्सर सिर-दर्द, पेट-दर्द या मितली आने की शिकायत करता है।',
  'अन्य बच्चों के साथ खुशी से चीजें बांट लेता है, जैसे खाने-पीने की चीजें, खिलौने या पेंसिल।',
  'अक्सर बदमिजाजी या चिड़चिड़ापन दिखाता है।',
  'अकेले रहना और खेलना अधिक पसंद करता है।',
  'आम तौर पर आज्ञाकारी है, अक्सर बड़ों का कहना मानता है।',
  'अनेक चिंताएं, अक्सर चिंतित लगता है।',
  'अगर किसी को चोट लग जाए, कोई उदास हो या किसी की तबियत खराब हो जाए तो मदद करता है।',
  'लगातार अधीर या छटपटाता है।',
  'कम से कम एक अच्छा दोस्त है।',
  'अक्सर अन्य बच्चों के साथ लड़ाई करता है या उन्हें डराता-धमकाता है।',
  'अक्सर अप्रसन्न, उदास या रोआंसा रहता है।',
  'आम तौर पर अन्य बच्चों द्वारा पसंद किया जाता है।',
  'बड़ी जल्दी किसी चीज से ध्यान हट जाता है, एकाग्रचित नहीं रहता।',
  'नई स्थितियों में बेचैन हो जाता है, बहुत जल्दी आत्मविश्वास खो बैठता है।',
  'अपने से छोटे बच्चों के प्रति दयालु है।',
  'अक्सर झूठ बोलता है या धोखा देता है।',
  'अन्य बच्चे तंग करते हैं या डराते-धमकाते हैं।',
  'अक्सर दूसरों की मदद करने के लिए खुद ही तैयार हो जाता है, जैसे माता-पिता, अध्यापक या अन्य बच्चे।',
  'कुछ भी करने से पहले सोचता है।',
  'घर, स्कूल या किसी और जगह से चोरी करता है।',
  'बच्चों की बजाय बड़ों के साथ खुश रहता है।',
  'भयभीत रहता है, बहुत जल्दी डर जाता है।',
  'किसी काम को पूरा करता है, ध्यान से करता है।',
]

const KN_ITEMS = [
  'ಇತರರ ಭಾವನೆಗಳಿಗೆ ಕಾಳಜಿ ತೋರಿಸುತ್ತಾನೆ ಅಥವಾ ತೋರಿಸುತ್ತಾಳೆ.',
  'ಚಂಚಲ, ಅತಿಯಾಗಿ ಚಟುವಟಿಕೆಯಾಗಿದ್ದು, ಹೆಚ್ಚು ಸಮಯ ಶಾಂತವಾಗಿ ಕುಳಿತುಕೊಳ್ಳಲು ಕಷ್ಟವಾಗುತ್ತದೆ.',
  'ತಲೆನೋವು, ಹೊಟ್ಟೆನೋವು ಅಥವಾ ಅಸ್ವಸ್ಥತೆ ಬಗ್ಗೆ ಆಗಾಗ ದೂರು ಹೇಳುತ್ತಾನೆ ಅಥವಾ ಹೇಳುತ್ತಾಳೆ.',
  'ಇತರ ಮಕ್ಕಳೊಂದಿಗೆ ವಸ್ತುಗಳನ್ನು ಸುಲಭವಾಗಿ ಹಂಚಿಕೊಳ್ಳುತ್ತಾನೆ ಅಥವಾ ಹಂಚಿಕೊಳ್ಳುತ್ತಾಳೆ.',
  'ಆಗಾಗ ಕೋಪದ ಸಿಡಿತ ಅಥವಾ ಕೆಟ್ಟ ಮನಸ್ಥಿತಿ ತೋರಿಸುತ್ತಾನೆ ಅಥವಾ ತೋರಿಸುತ್ತಾಳೆ.',
  'ಒಂಟಿಯಾಗಿ ಇರಲು ಇಷ್ಟಪಡುತ್ತಾನೆ ಅಥವಾ ಇಷ್ಟಪಡುತ್ತಾಳೆ, ಒಬ್ಬನೇ ಅಥವಾ ಒಬ್ಬಳೇ ಆಡಲು ಇಷ್ಟಪಡುತ್ತಾನೆ ಅಥವಾ ಇಷ್ಟಪಡುತ್ತಾಳೆ.',
  'ಸಾಮಾನ್ಯವಾಗಿ ವಿಧೇಯ, ದೊಡ್ಡವರು ಕೇಳಿದುದನ್ನು ಸಾಮಾನ್ಯವಾಗಿ ಮಾಡುತ್ತಾನೆ ಅಥವಾ ಮಾಡುತ್ತಾಳೆ.',
  'ಬಹಳ ಚಿಂತೆಗಳು ಇರುತ್ತವೆ, ಆಗಾಗ ಚಿಂತಿತನಾಗಿ ಅಥವಾ ಚಿಂತಿತಳಾಗಿ ಕಾಣುತ್ತಾನೆ ಅಥವಾ ಕಾಣುತ್ತಾಳೆ.',
  'ಯಾರಾದರೂ ಗಾಯಗೊಂಡರೆ, ದುಃಖಿತರಾದರೆ ಅಥವಾ ಅಸ್ವಸ್ಥರಾದರೆ ಸಹಾಯ ಮಾಡುತ್ತಾನೆ ಅಥವಾ ಮಾಡುತ್ತಾಳೆ.',
  'ಯಾವಾಗಲೂ ಚಡಪಡಿಸುತ್ತಾನೆ ಅಥವಾ ಅಶಾಂತನಾಗಿ ಚಲಿಸುತ್ತಿರುತ್ತಾನೆ.',
  'ಕನಿಷ್ಠ ಒಬ್ಬ ಒಳ್ಳೆಯ ಸ್ನೇಹಿತನಿದ್ದಾನೆ ಅಥವಾ ಸ್ನೇಹಿತೆಯಿದ್ದಾಳೆ.',
  'ಇತರ ಮಕ್ಕಳೊಂದಿಗೆ ಆಗಾಗ ಜಗಳ ಮಾಡುತ್ತಾನೆ ಅಥವಾ ಅವರನ್ನು ಬೆದರಿಸುತ್ತಾನೆ.',
  'ಆಗಾಗ ದುಃಖಿತ, ನಿರಾಶ ಅಥವಾ ಅಳುವಂತಿರುತ್ತಾನೆ ಅಥವಾ ಇರುತ್ತಾಳೆ.',
  'ಸಾಮಾನ್ಯವಾಗಿ ಇತರ ಮಕ್ಕಳಿಗೆ ಇಷ್ಟವಾಗುತ್ತಾನೆ ಅಥವಾ ಇಷ್ಟವಾಗುತ್ತಾಳೆ.',
  'ಸುಲಭವಾಗಿ ಗಮನ ಬೇರೆಡೆಗೆ ಹೋಗುತ್ತದೆ, ಏಕಾಗ್ರತೆ ಕಡಿಮೆಯಾಗುತ್ತದೆ.',
  'ಹೊಸ ಪರಿಸ್ಥಿತಿಗಳಲ್ಲಿ ಆತಂಕ ಅಥವಾ ಅಂಟಿಕೊಳ್ಳುವಿಕೆ ತೋರುತ್ತಾನೆ, ಆತ್ಮವಿಶ್ವಾಸ ಬೇಗ ಕಳೆದುಕೊಳ್ಳುತ್ತಾನೆ ಅಥವಾ ಕಳೆದುಕೊಳ್ಳುತ್ತಾಳೆ.',
  'ತನ್ನಿಗಿಂತ ಚಿಕ್ಕ ಮಕ್ಕಳಿಗೆ ದಯಾಳುವಾಗಿರುತ್ತಾನೆ ಅಥವಾ ಇರುತ್ತಾಳೆ.',
  'ಆಗಾಗ ಸುಳ್ಳು ಹೇಳುತ್ತಾನೆ ಅಥವಾ ಮೋಸ ಮಾಡುತ್ತಾನೆ.',
  'ಇತರ ಮಕ್ಕಳು ತೊಂದರೆ ಕೊಡುತ್ತಾರೆ ಅಥವಾ ಬೆದರಿಸುತ್ತಾರೆ.',
  'ಇತರರಿಗೆ ಸಹಾಯ ಮಾಡಲು ಆಗಾಗ ಸ್ವತಃ ಮುಂದೆ ಬರುತ್ತಾನೆ ಅಥವಾ ಬರುತ್ತಾಳೆ.',
  'ಏನಾದರೂ ಮಾಡುವ ಮೊದಲು ಯೋಚಿಸುತ್ತಾನೆ ಅಥವಾ ಯೋಚಿಸುತ್ತಾಳೆ.',
  'ಮನೆ, ಶಾಲೆ ಅಥವಾ ಬೇರೆಡೆಗಳಿಂದ ಕಳವು ಮಾಡುತ್ತಾನೆ ಅಥವಾ ಮಾಡುತ್ತಾಳೆ.',
  'ಇತರ ಮಕ್ಕಳಿಗಿಂತ ದೊಡ್ಡವರೊಂದಿಗೆ ಹೆಚ್ಚು ಚೆನ್ನಾಗಿ ಹೊಂದಿಕೊಳ್ಳುತ್ತಾನೆ ಅಥವಾ ಹೊಂದಿಕೊಳ್ಳುತ್ತಾಳೆ.',
  'ಬಹಳ ಭಯಗಳು ಇರುತ್ತವೆ, ಸುಲಭವಾಗಿ ಹೆದರುತ್ತಾನೆ ಅಥವಾ ಹೆದರುತ್ತಾಳೆ.',
  'ಗಮನ ಚೆನ್ನಾಗಿದೆ, ಕೆಲಸವನ್ನು ಕೊನೆವರೆಗೆ ಮಾಡುತ್ತಾನೆ ಅಥವಾ ಮಾಡುತ್ತಾಳೆ.',
]

export const SDQ_QUESTION_COUNT = 25

export function normalizeLanguage(language = 'en') {
  const key = String(language).toLowerCase().slice(0, 2)
  if (key === 'hi') return 'hi'
  if (key === 'kn') return 'kn'
  return 'en'
}

function itemsFor(language) {
  const lang = normalizeLanguage(language)
  const texts = lang === 'hi' ? HI_ITEMS : lang === 'kn' ? KN_ITEMS : EN_ITEMS
  return texts.map((text, index) => ({
    number: index + 1,
    text,
    scale: META[index][0],
    scaleLabel: SDQ_SCALES[META[index][0]],
    reverse: META[index][1],
  }))
}

function responseInstruction(language) {
  if (language === 'hi') return 'कृपया केवल इनमें से एक उत्तर बोलें: सही नहीं है, कुछ हद तक सही है, या निश्चित ही सही है।'
  if (language === 'kn') return 'ದಯವಿಟ್ಟು ಈ ಮೂರರಲ್ಲಿ ಒಂದನ್ನು ಮಾತ್ರ ಹೇಳಿ: ನಿಜವಲ್ಲ, ಸ್ವಲ್ಪ ನಿಜ, ಅಥವಾ ಖಂಡಿತವಾಗಿ ನಿಜ.'
  return 'Please answer: Not true, Somewhat true, or Certainly true.'
}

function intro(language, subjectName) {
  if (language === 'hi') {
    return `यह SDQ मनोवैज्ञानिक मूल्यांकन ${subjectName} के लिए है। पिछले छह महीनों के आधार पर हर कथन का उत्तर दें।`
  }
  if (language === 'kn') {
    return `ಇದು ${subjectName} ಗಾಗಿ SDQ ಮಾನಸಿಕ ಮೌಲ್ಯಮಾಪನ. ಕಳೆದ ಆರು ತಿಂಗಳ ಆಧಾರದ ಮೇಲೆ ಪ್ರತಿಯೊಂದು ಹೇಳಿಕೆಗೆ ಉತ್ತರಿಸಿ.`
  }
  return `This is an SDQ psychological assessment for ${subjectName}. Answer each statement based on the last six months.`
}

function formatQuestion(item, language, subjectName, includeIntro = false) {
  const prefix = includeIntro ? `${intro(language, subjectName)} ` : ''
  if (language === 'hi') {
    return `${prefix}कथन ${item.number} में से ${SDQ_QUESTION_COUNT}: "${item.text}" पिछले छह महीनों के आधार पर, यह कथन बच्चे के लिए कितना सही है? ${responseInstruction(language)}`
  }
  if (language === 'kn') {
    return `${prefix}ಹೇಳಿಕೆ ${item.number} / ${SDQ_QUESTION_COUNT}: "${item.text}" ಕಳೆದ ಆರು ತಿಂಗಳ ಆಧಾರದ ಮೇಲೆ, ಈ ಹೇಳಿಕೆ ಮಗುವಿಗೆ ಎಷ್ಟು ಸರಿ? ${responseInstruction(language)}`
  }
  return `${prefix}Statement ${item.number} of ${SDQ_QUESTION_COUNT}: "${item.text}" Based on the last six months, how true is this statement for the child? ${responseInstruction(language)}`
}

export async function getOpeningStatement({ subjectName = 'the subject', language = 'en' } = {}) {
  const lang = normalizeLanguage(language)
  return formatQuestion(itemsFor(lang)[0], lang, subjectName, true)
}

export async function getNextQuestion({ transcript = [], subjectName = 'the subject', language = 'en' } = {}) {
  const lang = normalizeLanguage(language)
  const answered = transcript.filter(entry => entry.speaker === 'SUBJECT').length
  const item = itemsFor(lang)[answered]
  if (!item) return null
  return formatQuestion(item, lang, subjectName, false)
}

function parseSdqAnswer(text, language) {
  const value = String(text || '').toLowerCase()
  const compact = value.replace(/\s+/g, ' ')
  const lang = normalizeLanguage(language)

  if (lang === 'hi') {
    if (/निश्चित|पूरी तरह|बिल्कुल|हाँ|हां|सही है|ही सही/.test(compact)) return { rawScore: 2, label: 'Certainly true' }
    if (/कुछ|थोड़ा|थोड़ा|हद/.test(compact)) return { rawScore: 1, label: 'Somewhat true' }
    if (/नहीं|नही|गलत|सही नहीं/.test(compact)) return { rawScore: 0, label: 'Not true' }
  }

  if (lang === 'kn') {
    if (/ಖಂಡಿತ|ಪೂರ್ಣ|ಹೌದು|ಸತ್ಯ|ನಿಜ/.test(compact) && !/ನಿಜವಲ್ಲ|ಅಲ್ಲ/.test(compact)) return { rawScore: 2, label: 'Certainly true' }
    if (/ಸ್ವಲ್ಪ|ಸ್ವಲ್ಪಮಟ್ಟಿಗೆ|ಕೆಲವೊಮ್ಮೆ/.test(compact)) return { rawScore: 1, label: 'Somewhat true' }
    if (/ನಿಜವಲ್ಲ|ಅಲ್ಲ|ಇಲ್ಲ/.test(compact)) return { rawScore: 0, label: 'Not true' }
  }

  if (/certain|definitely|very true|yes|true/.test(compact) && !/not true/.test(compact)) return { rawScore: 2, label: 'Certainly true' }
  if (/somewhat|partly|little|sometimes|moderate/.test(compact)) return { rawScore: 1, label: 'Somewhat true' }
  if (/not true|no|never|false/.test(compact)) return { rawScore: 0, label: 'Not true' }

  return { rawScore: null, label: 'Unclear spoken response' }
}

function sentimentFromText(text) {
  const value = String(text || '').toLowerCase()
  const negativeHits = ['not', 'never', 'worry', 'fear', 'sad', 'angry', 'fight', 'bully', 'steal', 'lie', 'cheat', 'उदास', 'डर', 'चिंता', 'गुस्सा', 'झूठ', 'ಕೋಪ', 'ಭಯ', 'ಚಿಂತೆ'].filter(word => value.includes(word)).length
  const positiveHits = ['true', 'yes', 'help', 'kind', 'friend', 'share', 'सहाय', 'दोस्त', 'दयालु', 'ಹಂಚ', 'ಸಹಾಯ', 'ಸ್ನೇಹ', 'ದಯೆ'].filter(word => value.includes(word)).length
  if (negativeHits > positiveHits + 1) return { label: 'strained', confidence: 0.74 }
  if (positiveHits > negativeHits) return { label: 'steady', confidence: 0.68 }
  return { label: 'neutral', confidence: 0.58 }
}

export function analyzeResponse(text, language = 'en', context = {}) {
  const lang = normalizeLanguage(language)
  const itemIndex = Number.isInteger(context.itemIndex) ? context.itemIndex : 0
  const item = itemsFor(lang)[itemIndex] || null
  const parsed = parseSdqAnswer(text, lang)
  const score = parsed.rawScore == null ? null : item?.reverse ? 2 - parsed.rawScore : parsed.rawScore
  const voiceScore = context.voiceMetrics?.stressScore ?? context.voiceMetrics?.strainScore ?? 0
  const behaviorScore = context.behaviorMetrics?.stressScore ?? context.behaviorMetrics?.agitationScore ?? 0
  const combined = Math.max(0, Math.min(1, (voiceScore * 0.45) + (behaviorScore * 0.45) + (score === 2 && item?.scale !== 'prosocial' ? 0.1 : 0)))
  const severity = combined > 0.7 ? 'high' : combined > 0.42 ? 'medium' : 'low'
  const sentiment = sentimentFromText(text)
  const indicators = []
  if (parsed.rawScore == null) indicators.push('unclear SDQ response')
  if (voiceScore > 0.6) indicators.push('voice strain')
  if (behaviorScore > 0.6) indicators.push('camera stress cue')
  if (score === 2 && item?.scale !== 'prosocial') indicators.push(`${item.scaleLabel} high response`)

  return {
    stressFlag: severity !== 'low' || indicators.length > 0,
    severity,
    indicators,
    forensicScore: Math.round(combined * 100),
    sentiment,
    voiceStress: voiceScore,
    behaviorStress: behaviorScore,
    sdq: item ? {
      itemNumber: item.number,
      scale: item.scale,
      scaleLabel: item.scaleLabel,
      reverseScored: item.reverse,
      rawScore: parsed.rawScore,
      score,
      responseLabel: parsed.label,
    } : null,
  }
}

export function getSdqQuestionCount() {
  return SDQ_QUESTION_COUNT
}
