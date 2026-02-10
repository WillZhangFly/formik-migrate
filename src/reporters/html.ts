/**
 * HTML Report Generator
 * Creates an interactive HTML dashboard for migration status
 */

import { CodebaseAnalysis, FileAnalysis } from '../analyzer';

/**
 * Generate an interactive HTML report
 */
export function generateHtmlReport(analysis: CodebaseAnalysis): string {
  const { formikFiles, autoConvertible, manualReviewNeeded, complexity, patterns, estimatedHours, estimatedSavings, files } = analysis;

  const autoPercentage = formikFiles > 0
    ? Math.round((autoConvertible / (autoConvertible + manualReviewNeeded)) * 100)
    : 0;

  const filesJson = JSON.stringify(files.map(f => ({
    path: f.filePath.split('/').slice(-3).join('/'),
    fullPath: f.filePath,
    patterns: f.patterns.length,
    autoConvertible: f.patterns.filter(p => p.canAutoConvert).length,
    manual: f.patterns.filter(p => !p.canAutoConvert).length,
    effort: f.estimatedEffort,
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Formik Migration Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #eee;
      min-height: 100vh;
      padding: 2rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    h1 {
      text-align: center;
      margin-bottom: 2rem;
      font-size: 2.5rem;
      background: linear-gradient(90deg, #00d9ff, #00ff88);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      text-align: center;
      color: #888;
      margin-bottom: 3rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 1.5rem;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 10px 40px rgba(0, 217, 255, 0.2);
    }

    .card-title {
      font-size: 0.875rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 0.5rem;
    }

    .card-value {
      font-size: 2.5rem;
      font-weight: 700;
    }

    .card-value.green { color: #00ff88; }
    .card-value.yellow { color: #ffcc00; }
    .card-value.red { color: #ff4444; }
    .card-value.blue { color: #00d9ff; }

    .progress-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 3rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .progress-bar {
      height: 24px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      overflow: hidden;
      margin: 1rem 0;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #00ff88, #00d9ff);
      border-radius: 12px;
      transition: width 0.5s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .legend {
      display: flex;
      gap: 2rem;
      justify-content: center;
      margin-top: 1rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .legend-dot.auto { background: #00ff88; }
    .legend-dot.manual { background: #ffcc00; }

    .patterns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-top: 2rem;
    }

    .pattern-card {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .pattern-name {
      font-family: 'Monaco', 'Menlo', monospace;
      color: #00d9ff;
      margin-bottom: 0.5rem;
    }

    .pattern-count {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .files-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 2rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .files-section h2 {
      margin-bottom: 1.5rem;
      color: #00d9ff;
    }

    .file-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .file-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: background 0.2s;
    }

    .file-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .file-path {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.875rem;
      color: #ccc;
    }

    .file-badges {
      display: flex;
      gap: 0.5rem;
    }

    .badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge.auto {
      background: rgba(0, 255, 136, 0.2);
      color: #00ff88;
    }

    .badge.manual {
      background: rgba(255, 204, 0, 0.2);
      color: #ffcc00;
    }

    .badge.effort-low { background: rgba(0, 255, 136, 0.2); color: #00ff88; }
    .badge.effort-medium { background: rgba(255, 204, 0, 0.2); color: #ffcc00; }
    .badge.effort-high { background: rgba(255, 68, 68, 0.2); color: #ff4444; }

    .time-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
      margin-top: 2rem;
    }

    .time-card {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
      padding: 1.5rem;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .time-card h3 {
      font-size: 0.875rem;
      color: #888;
      margin-bottom: 0.5rem;
    }

    .time-value {
      font-size: 2rem;
      font-weight: 700;
    }

    .savings { color: #00ff88; }

    footer {
      text-align: center;
      margin-top: 3rem;
      color: #666;
      font-size: 0.875rem;
    }

    footer a {
      color: #00d9ff;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔄 Formik Migration Report</h1>
    <p class="subtitle">Formik → React Hook Form</p>

    <div class="grid">
      <div class="card">
        <div class="card-title">Files with Formik</div>
        <div class="card-value blue">${formikFiles}</div>
      </div>
      <div class="card">
        <div class="card-title">Auto-Convertible</div>
        <div class="card-value green">${autoConvertible}</div>
      </div>
      <div class="card">
        <div class="card-title">Manual Review</div>
        <div class="card-value yellow">${manualReviewNeeded}</div>
      </div>
      <div class="card">
        <div class="card-title">Time Saved</div>
        <div class="card-value green">${estimatedSavings}h</div>
      </div>
    </div>

    <div class="progress-section">
      <h2>Migration Progress</h2>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${autoPercentage}%">
          ${autoPercentage}% Auto-Convertible
        </div>
      </div>
      <div class="legend">
        <div class="legend-item">
          <div class="legend-dot auto"></div>
          <span>Auto-convertible (${autoConvertible})</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot manual"></div>
          <span>Manual review (${manualReviewNeeded})</span>
        </div>
      </div>

      <div class="patterns-grid">
        <div class="pattern-card">
          <div class="pattern-name">useFormik</div>
          <div class="pattern-count">${patterns.useFormik}</div>
        </div>
        <div class="pattern-card">
          <div class="pattern-name">&lt;Formik&gt;</div>
          <div class="pattern-count">${patterns.Formik}</div>
        </div>
        <div class="pattern-card">
          <div class="pattern-name">&lt;Field&gt;</div>
          <div class="pattern-count">${patterns.Field}</div>
        </div>
        <div class="pattern-card">
          <div class="pattern-name">&lt;FieldArray&gt;</div>
          <div class="pattern-count">${patterns.FieldArray}</div>
        </div>
      </div>

      <div class="time-section">
        <div class="time-card">
          <h3>Estimated Manual Migration</h3>
          <div class="time-value">${estimatedHours} hours</div>
        </div>
        <div class="time-card">
          <h3>With formik-migrate</h3>
          <div class="time-value savings">~${Math.round((estimatedHours - estimatedSavings) * 10) / 10} hours</div>
        </div>
      </div>
    </div>

    <div class="files-section">
      <h2>📁 Files to Migrate</h2>
      <div class="file-list" id="fileList"></div>
    </div>

    <footer>
      Generated by <a href="https://github.com/willzhangfly/formik-migrate">formik-migrate</a>
      • ${new Date().toLocaleDateString()}
    </footer>
  </div>

  <script>
    const files = ${filesJson};
    const fileList = document.getElementById('fileList');

    files.forEach(file => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = \`
        <span class="file-path">\${file.path}</span>
        <div class="file-badges">
          \${file.autoConvertible > 0 ? \`<span class="badge auto">\${file.autoConvertible} auto</span>\` : ''}
          \${file.manual > 0 ? \`<span class="badge manual">\${file.manual} manual</span>\` : ''}
          <span class="badge effort-\${file.effort}">\${file.effort}</span>
        </div>
      \`;
      fileList.appendChild(item);
    });
  </script>
</body>
</html>`;
}
