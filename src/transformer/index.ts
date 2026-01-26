import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import * as fs from 'fs';

/**
 * Conversion result
 */
export interface ConversionResult {
  success: boolean;
  convertedCode?: string;
  error?: string;
  warnings: string[];
  changes: string[];
}

/**
 * Safe transformer - only converts simple, well-understood patterns
 */
export class SafeTransformer {
  private warnings: string[] = [];
  private changes: string[] = [];

  /**
   * Transform a file (only if safe to do so)
   */
  transformFile(filePath: string): ConversionResult {
    this.warnings = [];
    this.changes = [];

    const code = fs.readFileSync(filePath, 'utf-8');

    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });

      let hasUnsafePatterns = false;

      // First pass: check for unsafe patterns
      traverse(ast, {
        CallExpression: (path) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === 'useFormik'
          ) {
            if (!this.isSafeUseFormik(path)) {
              hasUnsafePatterns = true;
              this.warnings.push('Complex useFormik pattern detected - skipping auto-conversion');
            }
          }
        },
      });

      if (hasUnsafePatterns) {
        return {
          success: false,
          error: 'File contains complex patterns that need manual review',
          warnings: this.warnings,
          changes: [],
        };
      }

      // Second pass: transform safe patterns
      traverse(ast, {
        // Transform imports
        ImportDeclaration: (path) => {
          if (path.node.source.value === 'formik') {
            this.transformImports(path);
            this.changes.push('Updated imports from formik to react-hook-form');
          }
        },

        // Transform useFormik → useForm
        CallExpression: (path) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === 'useFormik'
          ) {
            this.transformUseFormik(path);
            this.changes.push('Converted useFormik() to useForm()');
          }
        },

        // Transform Field → register
        JSXElement: (path) => {
          if (
            t.isJSXIdentifier(path.node.openingElement.name) &&
            path.node.openingElement.name.name === 'Field'
          ) {
            if (this.isSafeField(path)) {
              this.transformField(path);
              this.changes.push('Converted <Field> to native input with register()');
            } else {
              this.warnings.push('Complex <Field> pattern - needs manual review');
            }
          }
        },
      });

      const output = generate(ast, {
        retainLines: true,
        comments: true,
      });

      return {
        success: true,
        convertedCode: output.code,
        warnings: this.warnings,
        changes: this.changes,
      };
    } catch (error) {
      return {
        success: false,
        error: `Parse error: ${(error as Error).message}`,
        warnings: this.warnings,
        changes: [],
      };
    }
  }

  /**
   * Check if useFormik is safe to auto-convert
   */
  private isSafeUseFormik(path: any): boolean {
    const arg = path.node.arguments[0];

    if (!t.isObjectExpression(arg)) {
      return false;
    }

    const props = arg.properties.map((p: any) =>
      t.isObjectProperty(p) && t.isIdentifier(p.key) ? p.key.name : ''
    );

    // Only convert if it has: initialValues, onSubmit, and optionally validationSchema
    const safeProps = ['initialValues', 'onSubmit', 'validationSchema'];
    const unsafeProps = ['validate', 'validateOnChange', 'validateOnBlur', 'enableReinitialize'];

    const hasUnsafe = props.some((p: string) => unsafeProps.includes(p));
    const hasOnlyAllowed = props.every((p: string) => safeProps.includes(p) || !p);

    return !hasUnsafe && hasOnlyAllowed;
  }

  /**
   * Check if Field is safe to convert
   */
  private isSafeField(path: any): boolean {
    const attrs = path.node.openingElement.attributes;

    // Safe if it's a simple input with just name and type
    const hasComplexProps = attrs.some(
      (attr: any) =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        ['render', 'component', 'children', 'as'].includes(attr.name.name)
    );

    return !hasComplexProps;
  }

  /**
   * Transform Formik imports to RHF
   */
  private transformImports(path: any) {
    const newSpecifiers: any[] = [];

    path.node.specifiers.forEach((spec: any) => {
      if (t.isImportSpecifier(spec)) {
        const name = spec.imported.name;

        if (name === 'useFormik') {
          newSpecifiers.push(
            t.importSpecifier(t.identifier('useForm'), t.identifier('useForm'))
          );
        } else if (name === 'Formik') {
          // Skip - component pattern needs manual review
        } else if (name === 'Field') {
          // Fields will use register, not imported
        } else {
          newSpecifiers.push(spec);
        }
      }
    });

    path.node.source = t.stringLiteral('react-hook-form');
    path.node.specifiers = newSpecifiers;
  }

  /**
   * Transform useFormik to useForm
   */
  private transformUseFormik(path: any) {
    const arg = path.node.arguments[0];

    if (!t.isObjectExpression(arg)) {
      return;
    }

    const newProps: any[] = [];

    arg.properties.forEach((prop: any) => {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
        const key = prop.key.name;

        if (key === 'initialValues') {
          // initialValues → defaultValues
          newProps.push(
            t.objectProperty(t.identifier('defaultValues'), prop.value)
          );
        } else if (key === 'validationSchema') {
          // validationSchema → resolver: yupResolver(schema)
          newProps.push(
            t.objectProperty(
              t.identifier('resolver'),
              t.callExpression(t.identifier('yupResolver'), [prop.value])
            )
          );
          this.warnings.push('Add: import { yupResolver } from "@hookform/resolvers/yup"');
        } else {
          newProps.push(prop);
        }
      }
    });

    arg.properties = newProps;
    path.node.callee.name = 'useForm';
  }

  /**
   * Transform simple Field to native input
   */
  private transformField(path: any) {
    const attrs = path.node.openingElement.attributes;
    let nameValue: string | null = null;
    let typeValue = 'text';

    // Extract name and type
    attrs.forEach((attr: any) => {
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
        if (attr.name.name === 'name' && t.isStringLiteral(attr.value)) {
          nameValue = attr.value.value;
        }
        if (attr.name.name === 'type' && t.isStringLiteral(attr.value)) {
          typeValue = attr.value.value;
        }
      }
    });

    if (!nameValue) {
      this.warnings.push('Field without name - skipped');
      return;
    }

    // Replace with: <input {...register("name")} type="text" />
    path.node.openingElement.name = t.jsxIdentifier('input');
    path.node.closingElement = null; // Self-closing

    path.node.openingElement.attributes = [
      t.jsxSpreadAttribute(
        t.callExpression(t.identifier('register'), [t.stringLiteral(nameValue)])
      ),
      t.jsxAttribute(t.jsxIdentifier('type'), t.stringLiteral(typeValue)),
    ];
  }
}
