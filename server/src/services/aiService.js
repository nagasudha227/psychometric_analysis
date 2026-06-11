// Compatibility facade for deployments that import aiService.js directly.
// The active local-first adaptive assessment engine lives in aiInterrogator.js.
export {
  normalizeLanguage,
  analyzeResponse,
  getOpeningStatement,
  getNextQuestion,
} from './aiInterrogator.js'
