/**
 * Watch mode - re-analyze on file changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { FormikAnalyzer, CodebaseAnalysis } from '../analyzer';

export interface WatchOptions {
  directory: string;
  onChange: (analysis: CodebaseAnalysis) => void;
  onError?: (error: Error) => void;
  debounceMs?: number;
}

export interface WatchResult {
  stop: () => void;
}

/**
 * Watch a directory for changes and re-analyze
 */
export function watchDirectory(options: WatchOptions): WatchResult {
  const {
    directory,
    onChange,
    onError,
    debounceMs = 500,
  } = options;

  const analyzer = new FormikAnalyzer();
  let debounceTimer: NodeJS.Timeout | null = null;
  let isAnalyzing = false;
  const watchers: fs.FSWatcher[] = [];

  const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
  const ignoreDirs = ['node_modules', 'dist', '.next', 'build', '.git'];

  /**
   * Run analysis with debouncing
   */
  const runAnalysis = async () => {
    if (isAnalyzing) return;

    isAnalyzing = true;
    try {
      const analysis = await analyzer.analyzeCodebase(directory);
      onChange(analysis);
    } catch (error) {
      onError?.(error as Error);
    } finally {
      isAnalyzing = false;
    }
  };

  /**
   * Handle file change event
   */
  const handleChange = (filename: string) => {
    // Check if it's a relevant file
    if (!filename) return;

    const ext = path.extname(filename);
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return;

    // Debounce
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(runAnalysis, debounceMs);
  };

  /**
   * Recursively watch directories
   */
  const watchDir = (dir: string) => {
    try {
      const watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
        if (filename) {
          // Check if it's in an ignored directory
          const isIgnored = ignoreDirs.some(ignored =>
            filename.includes(path.sep + ignored + path.sep) ||
            filename.startsWith(ignored + path.sep)
          );

          if (!isIgnored) {
            handleChange(filename);
          }
        }
      });

      watchers.push(watcher);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  // Start watching
  watchDir(directory);

  // Run initial analysis
  runAnalysis();

  // Return stop function
  return {
    stop: () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      watchers.forEach(watcher => watcher.close());
    },
  };
}

/**
 * Format watch output for console
 */
export function formatWatchOutput(analysis: CodebaseAnalysis, isUpdate: boolean = false): string {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = isUpdate ? '🔄' : '👀';

  const lines = [
    '',
    `${prefix} [${timestamp}] ${isUpdate ? 'Files changed - reanalyzing...' : 'Watching for changes...'}`,
    '',
    `   Files with Formik: ${analysis.formikFiles}`,
    `   Auto-convertible:  ${analysis.autoConvertible}`,
    `   Manual review:     ${analysis.manualReviewNeeded}`,
    '',
  ];

  return lines.join('\n');
}
