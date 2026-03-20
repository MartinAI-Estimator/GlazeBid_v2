/**
 * Learning Loop API Client
 * 
 * Captures user corrections for AI training:
 * - Every manual markup adjustment
 * - Validations (AI was correct)
 * - Rejections (AI was wrong)
 * 
 * This data builds the foundation for autonomous takeoff.
 */

const API_BASE = 'http://127.0.0.1:8000/api/learning';

/**
 * Generate unique session ID for tracking user behavior patterns
 */
let sessionId = null;
const getSessionId = () => {
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  return sessionId;
};

/**
 * Log when user corrects AI-generated markup
 * 
 * @param {string} projectName - Current project
 * @param {string} sheetId - Current sheet
 * @param {object} aiPrediction - Original AI coordinates/classification
 * @param {object} userCorrection - User's corrected coordinates/classification
 * @param {string} correctionType - Type of correction (coordinate_adjustment, class_change, etc.)
 */
export const logCorrection = async (projectName, sheetId, aiPrediction, userCorrection, correctionType = 'coordinate_adjustment') => {
  try {
    const response = await fetch(`${API_BASE}/log-correction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: projectName,
        sheet_id: sheetId,
        ai_prediction: aiPrediction,
        user_correction: userCorrection,
        correction_type: correctionType,
        session_id: getSessionId(),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Learning API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📚 Learning Loop: Correction logged', {
      magnitude: data.entry?.correction_magnitude,
      type: correctionType
    });
    
    return data;
  } catch (error) {
    console.error('❌ Failed to log correction:', error);
    // Don't block user workflow if learning API fails
    return null;
  }
};

/**
 * Log when user approves AI prediction (positive reinforcement)
 * 
 * @param {string} projectName - Current project
 * @param {string} sheetId - Current sheet
 * @param {object} aiPrediction - AI coordinates/classification that user approved
 */
export const logValidation = async (projectName, sheetId, aiPrediction) => {
  try {
    const response = await fetch(`${API_BASE}/log-validation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: projectName,
        sheet_id: sheetId,
        ai_prediction: aiPrediction,
        session_id: getSessionId(),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Learning API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Learning Loop: Validation logged (AI was correct!)');
    
    return data;
  } catch (error) {
    console.error('❌ Failed to log validation:', error);
    return null;
  }
};

/**
 * Log when user rejects AI prediction (negative feedback)
 * 
 * @param {string} projectName - Current project
 * @param {string} sheetId - Current sheet
 * @param {object} aiPrediction - AI coordinates/classification that user rejected
 * @param {string} reason - Why user rejected it
 * @param {string} correctClass - What it should have been (optional)
 */
export const logRejection = async (projectName, sheetId, aiPrediction, reason = 'user_rejected', correctClass = null) => {
  try {
    const response = await fetch(`${API_BASE}/log-rejection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: projectName,
        sheet_id: sheetId,
        ai_prediction: aiPrediction,
        reason: reason,
        correct_class: correctClass,
        session_id: getSessionId(),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Learning API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('❌ Learning Loop: Rejection logged (AI made mistake)');
    
    return data;
  } catch (error) {
    console.error('❌ Failed to log rejection:', error);
    return null;
  }
};

/**
 * Get learning statistics for current project
 * 
 * @param {string} projectName - Current project
 * @returns {object} Statistics (accuracy, correction count, training readiness)
 */
export const getStatistics = async (projectName) => {
  try {
    const response = await fetch(`${API_BASE}/statistics/${encodeURIComponent(projectName)}`);
    
    if (!response.ok) {
      throw new Error(`Learning API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.statistics;
  } catch (error) {
    console.error('❌ Failed to get learning statistics:', error);
    return null;
  }
};

/**
 * Export training data for model retraining
 * 
 * @param {string} projectName - Current project
 * @returns {object} Export result with file path
 */
export const exportTrainingData = async (projectName) => {
  try {
    const response = await fetch(`${API_BASE}/export-training-data/${encodeURIComponent(projectName)}`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error(`Learning API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📦 Training data exported:', data.export_path);
    return data;
  } catch (error) {
    console.error('❌ Failed to export training data:', error);
    return null;
  }
};

/**
 * Helper: Compare markup coordinates to detect if user corrected AI prediction
 * 
 * @param {object} originalMarkup - Original AI-generated markup
 * @param {object} modifiedMarkup - User's modified version
 * @returns {boolean} True if significantly different
 */
export const hasSignificantChange = (originalMarkup, modifiedMarkup) => {
  if (!originalMarkup || !modifiedMarkup) return false;
  
  // Check if classification changed
  if (originalMarkup.class !== modifiedMarkup.class) return true;
  
  // Check if coordinates changed significantly (> 5 pixels)
  const THRESHOLD = 5;
  
  const origPoints = originalMarkup.points || [];
  const modPoints = modifiedMarkup.points || [];
  
  if (origPoints.length !== modPoints.length) return true;
  
  for (let i = 0; i < origPoints.length; i++) {
    const dx = Math.abs(origPoints[i].x - modPoints[i].x);
    const dy = Math.abs(origPoints[i].y - modPoints[i].y);
    
    if (dx > THRESHOLD || dy > THRESHOLD) {
      return true;
    }
  }
  
  return false;
};
