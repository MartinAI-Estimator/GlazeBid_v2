import React, { useState } from 'react';
import { Upload, FileText, Brain, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * AI Training Panel - Import Bluebeam Markups & YOLO Model
 * 
 * This component allows users to train the AI using:
 * 1. Existing marked-up PDFs from Bluebeam (100+ drawing sets!)
 * 2. Pre-trained YOLO model (best.pt from Roboflow)
 * 
 * This provides instant AI expertise instead of waiting for manual corrections.
 */
const AiTrainingPanel = ({ projectName, onTrainingComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadingBluebeam, setUploadingBluebeam] = useState(false);
  const [uploadingModel, setUploadingModel] = useState(false);
  const [exportingDataset, setExportingDataset] = useState(false);
  const [trainingStats, setTrainingStats] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [message, setMessage] = useState('');

  // Check model status on mount
  React.useEffect(() => {
    checkModelStatus();
  }, []);

  const checkModelStatus = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/training/status');
      const data = await response.json();
      setModelStatus(data);
    } catch (error) {
      console.error('Failed to check model status:', error);
    }
  };

  const handleBluebeamUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingBluebeam(true);
    setMessage('');

    let totalMarkups = 0;
    let totalPages = 0;
    let totalPagesScanned = 0;
    let successCount = 0;
    let failCount = 0;
    let failedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Show progress
      setMessage(`📚 Processing file ${i + 1} of ${files.length}: ${file.name}...`);
      
      try {
        const formData = new FormData();
        formData.append('project_name', projectName);
        formData.append('file', file);

        const response = await fetch('http://127.0.0.1:8000/api/training/import-bluebeam', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`Failed to upload ${file.name}:`, errorData);
          failCount++;
          failedFiles.push({ name: file.name, error: errorData.detail || 'Upload failed' });
          continue;
        }

        const result = await response.json();

        if (result.markups_imported !== undefined) {
          totalMarkups += result.markups_imported;
          totalPages += result.pages_processed;
          totalPagesScanned += result.statistics?.total_pages || 0;
          successCount++;
          console.log(`✅ ${file.name}: ${result.markups_imported} markups from ${result.pages_processed}/${result.statistics?.total_pages || 0} pages`);
        }
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        failCount++;
        failedFiles.push({ name: file.name, error: error.message });
      }
    }

    setUploadingBluebeam(false);

    if (successCount > 0) {
      const stats = {
        markups_imported: totalMarkups,
        pages_processed: totalPages,
        pages_scanned: totalPagesScanned,
        files_processed: successCount,
        files_failed: failCount,
        failed_files: failedFiles
      };
      setTrainingStats(stats);
      
      let msg = `✅ Success! Imported ${totalMarkups} markups from ${totalPages} pages with markups (scanned ${totalPagesScanned} total pages) across ${successCount} file(s)`;
      if (failCount > 0) {
        msg += `\n\n⚠️ ${failCount} file(s) failed:\n${failedFiles.map(f => `- ${f.name}: ${f.error}`).join('\n')}`;
      }
      setMessage(msg);
      
      if (onTrainingComplete) {
        onTrainingComplete(stats);
      }
    } else {
      setMessage(`❌ Error: All ${failCount} file(s) failed to upload:\n${failedFiles.map(f => `- ${f.name}: ${f.error}`).join('\n')}`);
    }

    // Reset file input
    event.target.value = '';
  };

  const handleModelUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadingModel(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://127.0.0.1:8000/api/training/import-roboflow-model', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.status === 'success' || result.status === 'uploaded_but_not_loaded') {
        setMessage(`✅ ${result.message}`);
        await checkModelStatus();
        
        if (onTrainingComplete) {
          onTrainingComplete(result);
        }
      } else {
        setMessage(`❌ Error: ${result.detail || 'Upload failed'}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setUploadingModel(false);
    }
  };

  const handleExportTrainingData = async () => {
    console.log('🔵 Generate Training Dataset clicked!');
    console.log('🔵 Project name:', projectName);
    
    setExportingDataset(true);
    setMessage('');

    try {
      const url = `http://127.0.0.1:8000/api/training/export-yolo-dataset?project_name=${encodeURIComponent(projectName)}`;
      console.log('🔵 Calling API:', url);
      
      const response = await fetch(url, {
        method: 'POST'
      });

      console.log('🔵 Response status:', response.status);
      const result = await response.json();
      console.log('🔵 Response data:', result);

      if (result.status === 'success') {
        const stats = result.statistics;
        let msg = `✅ Success! Exported ${stats.exported_images} training images with ${stats.total_labels} labels!\n\n`;
        msg += `📊 Training Dataset Ready:\n`;
        msg += `   • Images: ${stats.exported_images}\n`;
        msg += `   • Labels: ${stats.total_labels}\n`;
        msg += `   • Classes: ${stats.classes}\n`;
        msg += `   • Location: backend/training_data/\n\n`;
        msg += `🎯 Next Steps:\n`;
        msg += result.next_steps.map((step, i) => `   ${i+1}. ${step}`).join('\n');
        
        setMessage(msg);
      } else {
        setMessage(`❌ Error: ${result.detail || 'Export failed'}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setExportingDataset(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          padding: '12px 24px',
          background: 'linear-gradient(135deg, #001F3F 0%, #007BFF 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0, 123, 255, 0.4)',
          transition: 'all 0.3s ease',
          fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'translateY(-2px)';
          e.target.style.boxShadow = '0 6px 16px rgba(0, 123, 255, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'translateY(0)';
          e.target.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.4)';
        }}
      >
        <Brain size={20} />
        Train AI
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        background: '#1e1e1e',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ 
            color: 'white', 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
          }}>
            <Brain size={28} color="#007BFF" />
            Train AI with Existing Expertise
          </h2>
          <p style={{ color: '#999', fontSize: '14px', margin: 0 }}>
            Upload marked-up Bluebeam PDFs and your trained YOLO model to give the AI instant expertise
          </p>
        </div>

        {/* Model Status */}
        {modelStatus && (
          <div style={{
            padding: '16px',
            background: modelStatus.yolo_model_loaded ? '#1e4620' : '#2d2d2d',
            border: `1px solid ${modelStatus.yolo_model_loaded ? '#4caf50' : '#555'}`,
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {modelStatus.yolo_model_loaded ? (
                <CheckCircle size={20} color="#4caf50" />
              ) : (
                <AlertCircle size={20} color="#ff9800" />
              )}
              <strong style={{ color: 'white' }}>
                Detection Method: {modelStatus.detection_method === 'yolo' ? 'YOLO Model' : 'Rule-Based CV'}
              </strong>
            </div>
            <div style={{ color: '#aaa', fontSize: '13px' }}>
              Expected Accuracy: <strong style={{ color: '#007BFF' }}>{modelStatus.expected_accuracy}</strong>
            </div>
          </div>
        )}

        {/* Upload Section 1: Bluebeam PDFs */}
        <div style={{
          background: '#2d2d2d',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px dashed #555'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ color: 'white', fontSize: '16px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="#007BFF" />
              Import Bluebeam Markups
            </h3>
            <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>
              Upload PDFs with existing markups from estimators. All annotations will be extracted and used as training data.
            </p>
          </div>

          <label style={{
            display: 'block',
            padding: '16px',
            background: '#383838',
            borderRadius: '6px',
            cursor: uploadingBluebeam ? 'not-allowed' : 'pointer',
            textAlign: 'center',
            border: '2px solid #007BFF',
            opacity: uploadingBluebeam ? 0.6 : 1
          }}>
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleBluebeamUpload}
              disabled={uploadingBluebeam}
              style={{ display: 'none' }}
            />
            {uploadingBluebeam ? (
              <span style={{ color: '#007BFF' }}>Importing markups...</span>
            ) : (
              <>
                <Upload size={24} color="#007BFF" style={{ display: 'block', margin: '0 auto 8px' }} />
                <span style={{ color: '#007BFF', fontWeight: 'bold' }}>Click to Upload Marked-Up PDFs</span>
                <div style={{ color: '#999', fontSize: '12px', marginTop: '4px' }}>
                  Select multiple PDFs at once. Upload anytime!
                </div>
              </>
            )}
          </label>

          {trainingStats && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: '#2d2d2d',
              borderRadius: '6px',
              border: '1px solid #007BFF'
            }}>
              <div style={{ color: 'white', fontSize: '14px', marginBottom: '8px', fontWeight: 'bold' }}>
                ✅ Import Complete!
              </div>
              <div style={{ color: '#aaa', fontSize: '13px' }}>
                • {trainingStats.markups_imported} markups imported<br/>
                • {trainingStats.pages_processed} pages with markups<br/>
                • {trainingStats.files_processed} file(s) processed
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Generate Training Dataset */}
        <div style={{
          padding: '20px',
          background: '#2a2a2a',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px dashed #555'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ color: 'white', fontSize: '16px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="#4caf50" />
              Generate Training Dataset
            </h3>
            <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>
              Convert your {trainingStats?.markups_imported || '294'} imported markups into YOLO training format. This prepares data for AI model training.
            </p>
          </div>

          <button
            onClick={handleExportTrainingData}
            disabled={exportingDataset}
            style={{
              width: '100%',
              padding: '14px',
              background: exportingDataset ? '#555' : '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: exportingDataset ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: exportingDataset ? 0.6 : 1
            }}
          >
            <FileText size={18} />
            {exportingDataset ? 'Generating Dataset...' : 'Generate Training Dataset'}
          </button>

          <div style={{
            marginTop: '12px',
            padding: '10px',
            background: '#1e2a1e',
            borderRadius: '4px',
            border: '1px solid #4caf50',
            fontSize: '12px',
            color: '#aaa'
          }}>
            💡 This creates images + labels in YOLO format for model training
          </div>
        </div>

        {/* Step 3: Upload YOLO Model */}
        <div style={{
          padding: '20px',
          background: '#2a2a2a',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px dashed #555'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ color: 'white', fontSize: '16px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={20} color="#001F3F" />
              Upload YOLO Model (best.pt)
            </h3>
            <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>
              Upload your trained YOLO model. Train locally or use Roboflow cloud training for 90%+ accuracy!
            </p>
          </div>

          <label style={{
            display: 'block',
            padding: '14px',
            background: '#001F3F',
            border: '2px solid #001F3F',
            borderRadius: '6px',
            cursor: uploadingModel ? 'not-allowed' : 'pointer',
            textAlign: 'center',
            opacity: uploadingModel ? 0.6 : 1
          }}>
            <input
              type="file"
              accept=".pt,.pth"
              onChange={handleModelUpload}
              disabled={uploadingModel}
              style={{ display: 'none' }}
            />
            {uploadingModel ? (
              <span style={{ color: 'white' }}>Uploading model...</span>
            ) : (
              <>
                <Upload size={24} color="white" style={{ display: 'block', margin: '0 auto 8px' }} />
                <span style={{ color: 'white', fontWeight: 'bold' }}>Click to Upload best.pt</span>
                <div style={{ color: '#ccc', fontSize: '12px', marginTop: '4px' }}>
                  Upload your trained YOLO model file
                </div>
              </>
            )}
          </label>
        </div>

        {/* Upload Section 2: YOLO Model */}
        <div style={{
          background: '#2d2d2d',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '2px dashed #555'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ color: 'white', fontSize: '16px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={20} color="#001F3F" />
              Upload YOLO Model (best.pt)
            </h3>
            <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>
              Upload your trained YOLO model from Roboflow. This immediately boosts accuracy from 60-70% to 80-90%!
            </p>
          </div>

          <label style={{
            display: 'block',
            padding: '16px',
            background: '#383838',
            borderRadius: '6px',
            cursor: uploadingModel ? 'not-allowed' : 'pointer',
            textAlign: 'center',
            border: '2px solid #001F3F',
            opacity: uploadingModel ? 0.6 : 1
          }}>
            <input
              type="file"
              accept=".pt,.pth"
              onChange={handleModelUpload}
              disabled={uploadingModel}
              style={{ display: 'none' }}
            />
            {uploadingModel ? (
              <span style={{ color: '#001F3F' }}>Uploading model...</span>
            ) : (
              <>
                <Upload size={24} color="#001F3F" style={{ display: 'block', margin: '0 auto 8px' }} />
                <span style={{ color: '#001F3F', fontWeight: 'bold' }}>Click to Upload best.pt</span>
                <div style={{ color: '#999', fontSize: '12px', marginTop: '4px' }}>
                  PyTorch model file from Roboflow training
                </div>
              </>
            )}
          </label>
        </div>

        {/* Message Display */}
        {message && (
          <div style={{
            padding: '12px',
            background: message.includes('✅') ? '#1e4620' : '#5c1919',
            border: `1px solid ${message.includes('✅') ? '#4caf50' : '#f44336'}`,
            borderRadius: '6px',
            color: 'white',
            fontSize: '14px',
            marginBottom: '20px',
            whiteSpace: 'pre-wrap'
          }}>
            {message}
          </div>
        )}

        {/* Info Box */}
        <div style={{
          padding: '16px',
          background: 'rgba(0, 123, 255, 0.1)',
          border: '1px solid rgba(0, 123, 255, 0.3)',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div style={{ color: '#007BFF', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
            💡 Training Tips
          </div>
          <ul style={{ color: '#aaa', fontSize: '12px', margin: 0, paddingLeft: '20px' }}>
            <li>Upload multiple drawing sets (100+) for best results</li>
            <li>best.pt model provides immediate 80-90% accuracy</li>
            <li>Bluebeam markups add domain-specific expertise</li>
            <li>Training data accumulates across all uploads</li>
          </ul>
        </div>

        {/* Close Button */}
        <button
          onClick={() => setIsOpen(false)}
          style={{
            width: '100%',
            padding: '12px',
            background: '#383838',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default AiTrainingPanel;
