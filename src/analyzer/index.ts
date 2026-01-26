import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Formik usage pattern detected in code
 */
export interface FormikPattern {
  type: 'useFormik' | 'Formik' | 'Field' | 'FieldArray' | 'FastField' | 'ErrorMessage' | 'useField';
  location: { file: string; line: number; column: number };
  complexity: 'simple' | 'medium' | 'complex';
  canAutoConvert: boolean;
  reason?: string;
}

/**
 * Analysis results for a single file
 */
export interface FileAnalysis {
  filePath: string;
  hasFormik: boolean;
  patterns: FormikPattern[];
  linesOfCode: number;
  estimatedEffort: 'low' | 'medium' | 'high';
}

/**
 * Complete codebase analysis
 */
export interface CodebaseAnalysis {
  totalFiles: number;
  formikFiles: number;
  patterns: {
    useFormik: number;
    Formik: number;
    Field: number;
    FieldArray: number;
    other: number;
  };
  complexity: {
    simple: number;
    medium: number;
    complex: number;
  };
  autoConvertible: number;
  manualReviewNeeded: number;
  estimatedHours: number;
  estimatedSavings: number; // hours saved by using this tool
  files: FileAnalysis[];
}

/**
 * Analyzer class - detects Formik usage patterns
 */
export class FormikAnalyzer {
  /**
   * Analyze a single file
   */
  analyzeFile(filePath: string): FileAnalysis {
    const code = fs.readFileSync(filePath, 'utf-8');
    const patterns: FormikPattern[] = [];
    
    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });

      let hasFormik = false;

      traverse(ast, {
        // Detect Formik imports
        ImportDeclaration: (path) => {
          if (path.node.source.value === 'formik') {
            hasFormik = true;
          }
        },

        // Detect useFormik hook
        CallExpression: (callPath) => {
          if (
            t.isIdentifier(callPath.node.callee) &&
            callPath.node.callee.name === 'useFormik'
          ) {
            const complexity = this.analyzeUseFormikComplexity(callPath);
            patterns.push({
              type: 'useFormik',
              location: {
                file: filePath,
                line: callPath.node.loc?.start.line || 0,
                column: callPath.node.loc?.start.column || 0,
              },
              complexity,
              canAutoConvert: complexity === 'simple',
              reason: complexity !== 'simple' 
                ? this.getComplexityReason(callPath) 
                : undefined,
            });
          }
        },

        // Detect <Formik> component
        JSXElement: (jsxPath) => {
          if (
            t.isJSXIdentifier(jsxPath.node.openingElement.name) &&
            jsxPath.node.openingElement.name.name === 'Formik'
          ) {
            const complexity = this.analyzeFormikComponentComplexity(jsxPath);
            patterns.push({
              type: 'Formik',
              location: {
                file: filePath,
                line: jsxPath.node.loc?.start.line || 0,
                column: jsxPath.node.loc?.start.column || 0,
              },
              complexity,
              canAutoConvert: complexity === 'simple',
              reason: complexity !== 'simple' 
                ? 'Complex render patterns need manual review' 
                : undefined,
            });
          }
        },

        // Detect <Field> components
        JSXOpeningElement: (jsxPath) => {
          if (t.isJSXIdentifier(jsxPath.node.name)) {
            const name = jsxPath.node.name.name;
            if (['Field', 'FastField', 'FieldArray'].includes(name)) {
              const hasCustomRender = jsxPath.node.attributes.some(
                (attr) =>
                  t.isJSXAttribute(attr) &&
                  t.isJSXIdentifier(attr.name) &&
                  ['render', 'component', 'children'].includes(attr.name.name)
              );

              patterns.push({
                type: name as any,
                location: {
                  file: filePath,
                  line: jsxPath.node.loc?.start.line || 0,
                  column: jsxPath.node.loc?.start.column || 0,
                },
                complexity: hasCustomRender ? 'medium' : 'simple',
                canAutoConvert: !hasCustomRender,
                reason: hasCustomRender 
                  ? 'Custom render/component prop needs adjustment' 
                  : undefined,
              });
            }
          }
        },
      });

      const linesOfCode = code.split('\n').length;
      const estimatedEffort = this.calculateEffort(patterns, linesOfCode);

      return {
        filePath,
        hasFormik,
        patterns,
        linesOfCode,
        estimatedEffort,
      };
    } catch (error) {
      return {
        filePath,
        hasFormik: false,
        patterns: [],
        linesOfCode: 0,
        estimatedEffort: 'low',
      };
    }
  }

  /**
   * Analyze entire codebase
   */
  async analyzeCodebase(directory: string): Promise<CodebaseAnalysis> {
    const glob = require('glob');
    
    const files = glob.sync('**/*.{ts,tsx,js,jsx}', {
      cwd: directory,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**'],
    });

    const analyses: FileAnalysis[] = [];
    
    for (const file of files) {
      const analysis = this.analyzeFile(file);
      if (analysis.hasFormik) {
        analyses.push(analysis);
      }
    }

    return this.aggregateAnalysis(analyses, files.length);
  }

  /**
   * Determine useFormik complexity
   */
  private analyzeUseFormikComplexity(path: any): 'simple' | 'medium' | 'complex' {
    const arg = path.node.arguments[0];
    
    if (!t.isObjectExpression(arg)) {
      return 'complex';
    }

    const props = arg.properties.map((p: any) => 
      t.isObjectProperty(p) && t.isIdentifier(p.key) ? p.key.name : ''
    );

    // Simple: just initialValues, onSubmit, maybe validationSchema
    const simpleProps = ['initialValues', 'onSubmit', 'validationSchema'];
    const hasOnlySimpleProps = props.every((p: string) => simpleProps.includes(p) || !p);

    if (hasOnlySimpleProps && props.length <= 3) {
      return 'simple';
    }

    // Complex: custom validate, enableReinitialize, complex config
    const complexProps = ['validate', 'validateOnChange', 'validateOnBlur', 'enableReinitialize'];
    const hasComplexProps = props.some((p: string) => complexProps.includes(p));

    if (hasComplexProps) {
      return 'complex';
    }

    return 'medium';
  }

  /**
   * Determine <Formik> component complexity
   */
  private analyzeFormikComponentComplexity(path: any): 'simple' | 'medium' | 'complex' {
    const attrs = path.node.openingElement.attributes;
    
    // Check for render props pattern
    const hasRenderProp = attrs.some(
      (attr: any) =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        ['render', 'children', 'component'].includes(attr.name.name)
    );

    if (hasRenderProp) {
      return 'medium';
    }

    // Check for complex props
    const propNames = attrs
      .filter((attr: any) => t.isJSXAttribute(attr))
      .map((attr: any) => (t.isJSXIdentifier(attr.name) ? attr.name.name : ''));

    const complexProps = ['validate', 'validateOnChange', 'validateOnBlur'];
    if (propNames.some((name: string) => complexProps.includes(name))) {
      return 'complex';
    }

    return 'simple';
  }

  /**
   * Get reason for complexity
   */
  private getComplexityReason(path: any): string {
    const arg = path.node.arguments[0];
    
    if (!t.isObjectExpression(arg)) {
      return 'Non-standard configuration object';
    }

    const props = arg.properties.map((p: any) =>
      t.isObjectProperty(p) && t.isIdentifier(p.key) ? p.key.name : ''
    );

    if (props.includes('validate')) {
      return 'Custom validate function (convert to Zod/Yup)';
    }
    if (props.includes('enableReinitialize')) {
      return 'Uses enableReinitialize (different pattern in RHF)';
    }
    if (props.includes('validateOnChange') || props.includes('validateOnBlur')) {
      return 'Custom validation triggers (adjust mode in RHF)';
    }

    return 'Complex configuration needs review';
  }

  /**
   * Calculate estimated effort
   */
  private calculateEffort(
    patterns: FormikPattern[],
    linesOfCode: number
  ): 'low' | 'medium' | 'high' {
    const complexCount = patterns.filter((p) => p.complexity === 'complex').length;
    const mediumCount = patterns.filter((p) => p.complexity === 'medium').length;

    if (complexCount > 2 || linesOfCode > 500) {
      return 'high';
    }
    if (complexCount > 0 || mediumCount > 3 || linesOfCode > 200) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Aggregate analysis from multiple files
   */
  private aggregateAnalysis(
    files: FileAnalysis[],
    totalFiles: number
  ): CodebaseAnalysis {
    const patterns = {
      useFormik: 0,
      Formik: 0,
      Field: 0,
      FieldArray: 0,
      other: 0,
    };

    const complexity = {
      simple: 0,
      medium: 0,
      complex: 0,
    };

    let autoConvertible = 0;
    let manualReviewNeeded = 0;

    files.forEach((file) => {
      file.patterns.forEach((pattern) => {
        // Count pattern types
        if (pattern.type === 'useFormik') patterns.useFormik++;
        else if (pattern.type === 'Formik') patterns.Formik++;
        else if (pattern.type === 'Field') patterns.Field++;
        else if (pattern.type === 'FieldArray') patterns.FieldArray++;
        else patterns.other++;

        // Count complexity
        complexity[pattern.complexity]++;

        // Count convertibility
        if (pattern.canAutoConvert) {
          autoConvertible++;
        } else {
          manualReviewNeeded++;
        }
      });
    });

    // Estimate hours
    // Simple forms: 15 min each
    // Medium: 30 min each
    // Complex: 1-2 hours each
    const estimatedHours = 
      (complexity.simple * 0.25) +
      (complexity.medium * 0.5) +
      (complexity.complex * 1.5);

    // Tool saves 80% of time on auto-convertible, 30% on manual
    const estimatedSavings =
      (autoConvertible * 0.25 * 0.8) +
      (manualReviewNeeded * 0.5 * 0.3);

    return {
      totalFiles,
      formikFiles: files.length,
      patterns,
      complexity,
      autoConvertible,
      manualReviewNeeded,
      estimatedHours: Math.round(estimatedHours * 10) / 10,
      estimatedSavings: Math.round(estimatedSavings * 10) / 10,
      files,
    };
  }
}
