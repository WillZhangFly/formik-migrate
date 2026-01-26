#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as path from 'path';
import * as fs from 'fs';
import { FormikAnalyzer } from './analyzer';
import { generateConsoleReport, generateJsonReport, generateMarkdownReport } from './reporter';
import { SafeTransformer } from './transformer';

const program = new Command();

program
  .name('formik-migrate')
  .description('Smart Formik to React Hook Form migration tool')
  .version('0.1.0');

/**
 * Analyze command - scan codebase and generate report
 */
program
  .command('analyze [directory]')
  .description('Analyze Formik usage in your codebase')
  .option('-f, --format <format>', 'Output format (console|json|markdown)', 'console')
  .option('-o, --output <file>', 'Save report to file')
  .action(async (directory = '.', options) => {
    const targetDir = path.resolve(process.cwd(), directory);

    console.log(chalk.cyan.bold('\n🔍 Analyzing Formik usage...\n'));

    const spinner = ora('Scanning files...').start();

    try {
      const analyzer = new FormikAnalyzer();
      const analysis = await analyzer.analyzeCodebase(targetDir);

      spinner.succeed(chalk.green('Analysis complete!'));

      // Generate report based on format
      if (options.format === 'json') {
        const report = generateJsonReport(analysis);
        if (options.output) {
          fs.writeFileSync(options.output, report);
          console.log(chalk.green(`\n✓ Report saved to ${options.output}\n`));
        } else {
          console.log(report);
        }
      } else if (options.format === 'markdown') {
        const report = generateMarkdownReport(analysis);
        if (options.output) {
          fs.writeFileSync(options.output, report);
          console.log(chalk.green(`\n✓ Report saved to ${options.output}\n`));
        } else {
          console.log(report);
        }
      } else {
        // Console format (default)
        generateConsoleReport(analysis);

        if (options.output) {
          const mdReport = generateMarkdownReport(analysis);
          fs.writeFileSync(options.output, mdReport);
          console.log(chalk.green(`📄 Report also saved to ${options.output}\n`));
        }
      }

      // Exit code based on findings
      process.exit(analysis.formikFiles > 0 ? 0 : 1);
    } catch (error) {
      spinner.fail(chalk.red('Analysis failed'));
      console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
      process.exit(1);
    }
  });

/**
 * Convert command - actually migrate the code
 */
program
  .command('convert [directory]')
  .description('Convert Formik code to React Hook Form (safe patterns only)')
  .option('-d, --dry-run', 'Preview changes without modifying files')
  .option('-b, --backup', 'Create .backup files before converting')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (directory = '.', options) => {
    const targetDir = path.resolve(process.cwd(), directory);

    console.log(chalk.cyan.bold('\n🔄 Formik to React Hook Form Converter\n'));

    // First, analyze
    const spinner = ora('Analyzing codebase...').start();
    const analyzer = new FormikAnalyzer();
    const analysis = await analyzer.analyzeCodebase(targetDir);
    spinner.succeed();

    if (analysis.autoConvertible === 0) {
      console.log(chalk.yellow('\n⚠️  No auto-convertible patterns found.'));
      console.log(chalk.yellow('All patterns need manual review.\n'));
      process.exit(0);
    }

    console.log(chalk.green(`\n✓ Found ${analysis.autoConvertible} auto-convertible patterns`));
    console.log(chalk.yellow(`⚠ ${analysis.manualReviewNeeded} patterns need manual review\n`));

    // Confirm unless --yes
    if (!options.yes && !options.dryRun) {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: chalk.yellow(
            `Convert ${analysis.autoConvertible} patterns? (${
              options.backup ? 'backups will be created' : 'NO backups'
            })`
          ),
          default: false,
        },
      ]);

      if (!confirmed) {
        console.log(chalk.red('\n❌ Conversion cancelled.\n'));
        process.exit(0);
      }
    }

    // Convert files
    const convertSpinner = ora('Converting files...').start();
    const transformer = new SafeTransformer();
    let converted = 0;
    let skipped = 0;
    const allWarnings: string[] = [];

    for (const file of analysis.files) {
      const hasAutoConvertible = file.patterns.some((p) => p.canAutoConvert);

      if (!hasAutoConvertible) {
        skipped++;
        continue;
      }

      try {
        const result = transformer.transformFile(file.filePath);

        if (result.success && result.convertedCode) {
          if (!options.dryRun) {
            // Backup if requested
            if (options.backup) {
              fs.writeFileSync(`${file.filePath}.backup`, fs.readFileSync(file.filePath));
            }

            // Write converted code
            fs.writeFileSync(file.filePath, result.convertedCode);
          }

          converted++;
          allWarnings.push(...result.warnings);
        } else {
          skipped++;
          if (result.error) {
            allWarnings.push(`${file.filePath}: ${result.error}`);
          }
        }
      } catch (error) {
        skipped++;
        allWarnings.push(`${file.filePath}: ${(error as Error).message}`);
      }
    }

    convertSpinner.succeed(
      chalk.green(
        options.dryRun
          ? `Dry run complete! Would convert ${converted} files`
          : `Converted ${converted} files`
      )
    );

    if (skipped > 0) {
      console.log(chalk.yellow(`⚠ Skipped ${skipped} files (manual review needed)`));
    }

    // Show warnings
    if (allWarnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      const uniqueWarnings = [...new Set(allWarnings)];
      uniqueWarnings.slice(0, 10).forEach((w) => {
        console.log(chalk.yellow(`   • ${w}`));
      });
      if (uniqueWarnings.length > 10) {
        console.log(chalk.yellow(`   ... and ${uniqueWarnings.length - 10} more`));
      }
    }

    if (!options.dryRun && converted > 0) {
      console.log(chalk.green.bold('\n✅ Conversion complete!\n'));

      console.log(chalk.cyan('📋 Next steps:'));
      console.log('   1. Install dependencies:');
      console.log(chalk.gray('      npm install react-hook-form @hookform/resolvers'));
      console.log('   2. Review changes:');
      console.log(chalk.gray('      git diff'));
      console.log('   3. Test your forms thoroughly');
      console.log('   4. Review files that need manual attention');
      console.log('   5. Commit changes:');
      console.log(chalk.gray('      git add . && git commit -m "Migrate from Formik to RHF"'));
      console.log();
      
      // Simple support message
      console.log(chalk.yellow('━'.repeat(60)));
      console.log(chalk.bold(`\n💚 Saved you ${analysis.estimatedSavings.toFixed(1)} hours? Consider buying me a coffee!`));
      console.log(chalk.cyan('   https://buymeacoffee.com/willzhangfly'));
      console.log(chalk.gray('\n   formik-migrate is free & open source. Tips keep it alive! ☕\n'));
      console.log(chalk.yellow('━'.repeat(60)));
      console.log();
    } else if (options.dryRun) {
      console.log(chalk.blue('\n💡 Run without --dry-run to apply changes\n'));
    }
  });

/**
 * Stats command - quick summary
 */
program
  .command('stats [directory]')
  .description('Quick summary of Formik usage')
  .action(async (directory = '.') => {
    const targetDir = path.resolve(process.cwd(), directory);

    const spinner = ora('Scanning...').start();
    const analyzer = new FormikAnalyzer();
    const analysis = await analyzer.analyzeCodebase(targetDir);
    spinner.stop();

    console.log();
    console.log(chalk.bold('Formik Usage Summary:'));
    console.log();
    console.log(`  Files with Formik:      ${chalk.yellow(analysis.formikFiles)}`);
    console.log(`  Auto-convertible:       ${chalk.green(analysis.autoConvertible)}`);
    console.log(`  Manual review needed:   ${chalk.red(analysis.manualReviewNeeded)}`);
    console.log(`  Estimated time:         ${chalk.blue(analysis.estimatedHours + ' hours')}`);
    console.log(`  Time saved with tool:   ${chalk.green(analysis.estimatedSavings + ' hours')}`);
    console.log();
  });

program.parse();
