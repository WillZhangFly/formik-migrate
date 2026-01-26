import chalk from 'chalk';
import Table from 'cli-table3';
import type { CodebaseAnalysis, FileAnalysis } from '../analyzer';

/**
 * Generate a beautiful console report
 */
export function generateConsoleReport(analysis: CodebaseAnalysis): void {
  console.log('\n');
  console.log(chalk.cyan.bold('╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║         Formik → React Hook Form Migration Analysis         ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════════╝'));
  console.log('\n');

  // Summary Statistics
  const summaryTable = new Table({
    head: [chalk.bold('Metric'), chalk.bold('Count')],
    colWidths: [40, 20],
  });

  summaryTable.push(
    ['Total Files Scanned', analysis.totalFiles.toString()],
    [chalk.yellow('Files Using Formik'), chalk.yellow.bold(analysis.formikFiles.toString())],
    ['', ''],
    [chalk.green('✓ Auto-Convertible'), chalk.green.bold(analysis.autoConvertible.toString())],
    [chalk.red('⚠ Manual Review Needed'), chalk.red.bold(analysis.manualReviewNeeded.toString())]
  );

  console.log(summaryTable.toString());
  console.log('\n');

  // Pattern Breakdown
  const patternTable = new Table({
    head: [chalk.bold('Formik Pattern'), chalk.bold('Count'), chalk.bold('Complexity')],
    colWidths: [25, 15, 30],
  });

  patternTable.push(
    ['useFormik() hook', analysis.patterns.useFormik.toString(), getComplexityBar(analysis.complexity)],
    ['<Formik> component', analysis.patterns.Formik.toString(), ''],
    ['<Field> components', analysis.patterns.Field.toString(), ''],
    ['<FieldArray>', analysis.patterns.FieldArray.toString(), ''],
    ['Other patterns', analysis.patterns.other.toString(), '']
  );

  console.log(chalk.bold('📊 Pattern Breakdown:'));
  console.log(patternTable.toString());
  console.log('\n');

  // Complexity Distribution
  console.log(chalk.bold('🎯 Complexity Distribution:'));
  console.log('');
  console.log(`  ${chalk.green('●')} Simple:  ${chalk.green(analysis.complexity.simple)} (auto-convertible)`);
  console.log(`  ${chalk.yellow('●')} Medium:  ${chalk.yellow(analysis.complexity.medium)} (needs minor adjustments)`);
  console.log(`  ${chalk.red('●')} Complex: ${chalk.red(analysis.complexity.complex)} (manual review required)`);
  console.log('\n');

  // Time Estimates
  console.log(chalk.bold('⏱️  Time Estimates:'));
  console.log('');
  console.log(`  Manual migration:        ${chalk.red.bold(formatHours(analysis.estimatedHours))}`);
  console.log(`  With formik-migrate:     ${chalk.green.bold(formatHours(analysis.estimatedHours - analysis.estimatedSavings))}`);
  console.log(`  ${chalk.green.bold('Time saved:')}              ${chalk.green.bold(formatHours(analysis.estimatedSavings))}`);
  console.log('\n');

  // ROI Calculation
  const manualCost = analysis.estimatedHours * 100; // $100/hr developer rate
  const toolSavings = analysis.estimatedSavings * 100;
  
  console.log(chalk.bold('💰 ROI Calculation (@ $100/hr):'));
  console.log('');
  console.log(`  Manual migration cost:   ${chalk.red('$' + manualCost.toFixed(0))}`);
  console.log(`  ${chalk.green.bold('Savings with tool:')}       ${chalk.green.bold('$' + toolSavings.toFixed(0))}`);
  console.log('\n');

  // Top Files
  if (analysis.files.length > 0) {
    const topFiles = analysis.files
      .sort((a, b) => b.patterns.length - a.patterns.length)
      .slice(0, 5);

    console.log(chalk.bold('📁 Files with Most Formik Usage:'));
    console.log('');
    
    topFiles.forEach((file, index) => {
      const effort = getEffortIcon(file.estimatedEffort);
      const shortPath = file.filePath.split('/').slice(-3).join('/');
      console.log(`  ${index + 1}. ${shortPath}`);
      console.log(`     ${effort} ${file.patterns.length} patterns • Effort: ${file.estimatedEffort}`);
    });
    console.log('\n');
  }

  // Next Steps
  console.log(chalk.cyan.bold('📋 Next Steps:'));
  console.log('');
  console.log(`  ${chalk.bold('1.')} Review auto-convertible patterns (${analysis.autoConvertible} items)`);
  console.log(`  ${chalk.bold('2.')} Run migration: ${chalk.cyan('formik-migrate convert')}`);
  console.log(`  ${chalk.bold('3.')} Review flagged items (${analysis.manualReviewNeeded} items)`);
  console.log(`  ${chalk.bold('4.')} Test your forms`);
  console.log(`  ${chalk.bold('5.')} Deploy with confidence ✨`);
  console.log('\n');

  // No upgrade CTA - keep it simple
}

/**
 * Generate JSON report
 */
export function generateJsonReport(analysis: CodebaseAnalysis): string {
  return JSON.stringify(analysis, null, 2);
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(analysis: CodebaseAnalysis): string {
  let md = '# Formik → React Hook Form Migration Report\n\n';
  
  md += '## Summary\n\n';
  md += `- **Total Files Scanned:** ${analysis.totalFiles}\n`;
  md += `- **Files Using Formik:** ${analysis.formikFiles}\n`;
  md += `- **Auto-Convertible:** ${analysis.autoConvertible} ✓\n`;
  md += `- **Manual Review Needed:** ${analysis.manualReviewNeeded} ⚠️\n\n`;
  
  md += '## Pattern Breakdown\n\n';
  md += `| Pattern | Count |\n`;
  md += `|---------|-------|\n`;
  md += `| useFormik() | ${analysis.patterns.useFormik} |\n`;
  md += `| <Formik> | ${analysis.patterns.Formik} |\n`;
  md += `| <Field> | ${analysis.patterns.Field} |\n`;
  md += `| <FieldArray> | ${analysis.patterns.FieldArray} |\n\n`;
  
  md += '## Complexity\n\n';
  md += `- 🟢 Simple: ${analysis.complexity.simple}\n`;
  md += `- 🟡 Medium: ${analysis.complexity.medium}\n`;
  md += `- 🔴 Complex: ${analysis.complexity.complex}\n\n`;
  
  md += '## Time Estimates\n\n';
  md += `- **Manual migration:** ${formatHours(analysis.estimatedHours)}\n`;
  md += `- **With formik-migrate:** ${formatHours(analysis.estimatedHours - analysis.estimatedSavings)}\n`;
  md += `- **Time saved:** ${formatHours(analysis.estimatedSavings)} 🎉\n\n`;
  
  md += '## Files\n\n';
  analysis.files.forEach((file) => {
    const shortPath = file.filePath.split('/').slice(-4).join('/');
    md += `### ${shortPath}\n\n`;
    md += `- Patterns: ${file.patterns.length}\n`;
    md += `- Effort: ${file.estimatedEffort}\n`;
    
    if (file.patterns.some((p) => !p.canAutoConvert)) {
      md += `- ⚠️ Manual review needed\n`;
    }
    md += '\n';
  });
  
  return md;
}

/**
 * Helper: Format hours
 */
function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  }
  return `${hours.toFixed(1)} hours`;
}

/**
 * Helper: Get complexity bar
 */
function getComplexityBar(complexity: { simple: number; medium: number; complex: number }): string {
  const total = complexity.simple + complexity.medium + complexity.complex;
  if (total === 0) return '';
  
  const simplePercent = Math.round((complexity.simple / total) * 100);
  const mediumPercent = Math.round((complexity.medium / total) * 100);
  const complexPercent = Math.round((complexity.complex / total) * 100);
  
  return `${chalk.green('■'.repeat(Math.floor(simplePercent / 10)))}${chalk.yellow('■'.repeat(Math.floor(mediumPercent / 10)))}${chalk.red('■'.repeat(Math.floor(complexPercent / 10)))}`;
}

/**
 * Helper: Get effort icon
 */
function getEffortIcon(effort: 'low' | 'medium' | 'high'): string {
  switch (effort) {
    case 'low':
      return chalk.green('✓');
    case 'medium':
      return chalk.yellow('◐');
    case 'high':
      return chalk.red('●');
  }
}
