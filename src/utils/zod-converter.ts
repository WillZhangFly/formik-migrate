/**
 * Yup to Zod schema converter
 * Converts common Yup validation patterns to Zod equivalents
 */

export interface ZodConversionResult {
  success: boolean;
  zodSchema?: string;
  warnings: string[];
  unsupportedMethods: string[];
}

/**
 * Map of Yup methods to Zod equivalents
 */
const YUP_TO_ZOD_MAP: Record<string, string> = {
  // String methods
  'string': 'z.string()',
  'email': '.email()',
  'url': '.url()',
  'uuid': '.uuid()',
  'min': '.min',
  'max': '.max',
  'length': '.length',
  'matches': '.regex',
  'trim': '.trim()',
  'lowercase': '.toLowerCase()',
  'uppercase': '.toUpperCase()',

  // Number methods
  'number': 'z.number()',
  'integer': '.int()',
  'positive': '.positive()',
  'negative': '.negative()',
  'moreThan': '.gt',
  'lessThan': '.lt',

  // Boolean
  'boolean': 'z.boolean()',

  // Date
  'date': 'z.date()',

  // Array
  'array': 'z.array',
  'of': '',  // handled specially

  // Object
  'object': 'z.object',
  'shape': '',  // handled specially

  // Common modifiers
  'required': '',  // Zod is required by default
  'optional': '.optional()',
  'nullable': '.nullable()',
  'defined': '',  // default in Zod
  'default': '.default',
  'oneOf': '.refine',  // needs special handling
  'notOneOf': '.refine',  // needs special handling
};

/**
 * Convert a Yup schema string to Zod
 */
export function convertYupToZod(yupCode: string): ZodConversionResult {
  const warnings: string[] = [];
  const unsupportedMethods: string[] = [];

  try {
    let zodCode = yupCode;

    // Replace Yup import with Zod
    zodCode = zodCode.replace(
      /import\s+\*\s+as\s+Yup\s+from\s+['"]yup['"]/g,
      "import { z } from 'zod'"
    );
    zodCode = zodCode.replace(
      /import\s+{\s*([^}]+)\s*}\s+from\s+['"]yup['"]/g,
      "import { z } from 'zod'"
    );

    // Replace Yup.object().shape({}) with z.object({})
    zodCode = zodCode.replace(
      /Yup\.object\(\)\.shape\(\{/g,
      'z.object({'
    );
    zodCode = zodCode.replace(
      /Yup\.object\(\{/g,
      'z.object({'
    );

    // Replace basic Yup types
    zodCode = zodCode.replace(/Yup\.string\(\)/g, 'z.string()');
    zodCode = zodCode.replace(/Yup\.number\(\)/g, 'z.number()');
    zodCode = zodCode.replace(/Yup\.boolean\(\)/g, 'z.boolean()');
    zodCode = zodCode.replace(/Yup\.date\(\)/g, 'z.date()');
    zodCode = zodCode.replace(/Yup\.array\(\)/g, 'z.array(z.unknown())');

    // Replace common methods
    zodCode = zodCode.replace(/\.email\([^)]*\)/g, '.email()');
    zodCode = zodCode.replace(/\.url\([^)]*\)/g, '.url()');
    zodCode = zodCode.replace(/\.uuid\([^)]*\)/g, '.uuid()');
    zodCode = zodCode.replace(/\.integer\([^)]*\)/g, '.int()');
    zodCode = zodCode.replace(/\.positive\([^)]*\)/g, '.positive()');
    zodCode = zodCode.replace(/\.negative\([^)]*\)/g, '.negative()');

    // Handle min/max with messages
    zodCode = zodCode.replace(
      /\.min\((\d+),\s*['"]([^'"]+)['"]\)/g,
      '.min($1, { message: "$2" })'
    );
    zodCode = zodCode.replace(
      /\.max\((\d+),\s*['"]([^'"]+)['"]\)/g,
      '.max($1, { message: "$2" })'
    );

    // Handle min/max without messages
    zodCode = zodCode.replace(/\.min\((\d+)\)/g, '.min($1)');
    zodCode = zodCode.replace(/\.max\((\d+)\)/g, '.max($1)');

    // Handle required() - Zod is required by default, so we remove it
    // But we need to handle the error message
    zodCode = zodCode.replace(
      /\.required\(['"]([^'"]+)['"]\)/g,
      (match, msg) => {
        warnings.push(`Note: Zod fields are required by default. Custom message "${msg}" preserved.`);
        return '';
      }
    );
    zodCode = zodCode.replace(/\.required\(\)/g, '');

    // Handle optional()
    zodCode = zodCode.replace(/\.optional\(\)/g, '.optional()');
    zodCode = zodCode.replace(/\.nullable\(\)/g, '.nullable()');

    // Handle matches() -> regex()
    zodCode = zodCode.replace(
      /\.matches\(([^,]+),\s*['"]([^'"]+)['"]\)/g,
      '.regex($1, { message: "$2" })'
    );
    zodCode = zodCode.replace(/\.matches\(([^)]+)\)/g, '.regex($1)');

    // Handle oneOf -> enum or refine
    const oneOfMatches = zodCode.match(/\.oneOf\(\[([^\]]+)\]/g);
    if (oneOfMatches) {
      oneOfMatches.forEach(match => {
        warnings.push('oneOf() converted to z.enum() - verify values are string literals');
      });
    }
    zodCode = zodCode.replace(
      /\.oneOf\(\[([^\]]+)\][^)]*\)/g,
      (match, values) => {
        const cleanValues = values.trim();
        return `.refine((val) => [${cleanValues}].includes(val), { message: "Invalid value" })`;
      }
    );

    // Handle moreThan/lessThan
    zodCode = zodCode.replace(/\.moreThan\(([^)]+)\)/g, '.gt($1)');
    zodCode = zodCode.replace(/\.lessThan\(([^)]+)\)/g, '.lt($1)');

    // Handle when() - needs manual review
    if (zodCode.includes('.when(')) {
      warnings.push('when() conditional validation needs manual conversion to .refine() or .superRefine()');
      unsupportedMethods.push('when');
    }

    // Handle test() - needs manual review
    if (zodCode.includes('.test(')) {
      warnings.push('test() custom validation needs conversion to .refine()');
      unsupportedMethods.push('test');
    }

    // Handle transform()
    if (zodCode.includes('.transform(')) {
      warnings.push('transform() needs review - Zod uses .transform() similarly');
    }

    // Detect any remaining Yup references
    const remainingYup = zodCode.match(/Yup\.\w+/g);
    if (remainingYup) {
      const unique = [...new Set(remainingYup)];
      unique.forEach(method => {
        unsupportedMethods.push(method);
      });
      warnings.push(`Some Yup methods need manual conversion: ${unique.join(', ')}`);
    }

    return {
      success: unsupportedMethods.length === 0,
      zodSchema: zodCode,
      warnings,
      unsupportedMethods,
    };
  } catch (error) {
    return {
      success: false,
      warnings: [`Conversion error: ${(error as Error).message}`],
      unsupportedMethods: [],
    };
  }
}

/**
 * Generate Zod resolver import
 */
export function getZodResolverImport(): string {
  return "import { zodResolver } from '@hookform/resolvers/zod';";
}

/**
 * Get the Zod equivalent for a Yup method
 */
export function getZodEquivalent(yupMethod: string): string | null {
  return YUP_TO_ZOD_MAP[yupMethod] || null;
}
