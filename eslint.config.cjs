/**
 * ESLint configuration for bridge-kit
 * Enforces code style rules from .claude/CODESTYLE.md
 */

const { defineConfig, globalIgnores } = require('eslint/config');
const tsParser = require('@typescript-eslint/parser');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const globals = require('globals');
const js = require('@eslint/js');
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = defineConfig([
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },

    plugins: {
      '@typescript-eslint': typescriptEslint,
    },

    extends: compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-requiring-type-checking',
      'prettier'
    ),

    rules: {
      // ============================================
      // NAMING CONVENTIONS (from CODESTYLE.md)
      // ============================================

      // Enforce camelCase for variables and functions
      camelcase: [
        'error',
        {
          properties: 'never',
          ignoreDestructuring: false,
          ignoreImports: false,
          ignoreGlobals: false,
          // Allow leading underscore for private members
          allow: ['^_[a-z][a-zA-Z0-9]*$'],
        },
      ],

      // Enforce PascalCase for classes
      '@typescript-eslint/naming-convention': [
        'error',
        // Classes: PascalCase
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        // Interfaces: IPascalCase (prefix I)
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: true,
          },
        },
        // Types: TPascalCase (prefix T)
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
          custom: {
            regex: '^T[A-Z]',
            match: true,
          },
        },
        // Enums: PascalCase (singular)
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        // Enum members: UPPER_SNAKE_CASE
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
        // Variables: camelCase or UPPER_SNAKE_CASE (for constants)
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          // Allow leading underscore for private, $ for observables
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        // Functions: camelCase
        {
          selector: 'function',
          format: ['camelCase'],
        },
        // Parameters: camelCase
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        // Methods: camelCase
        {
          selector: 'method',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        // Private methods/properties: _camelCase (optional underscore)
        {
          selector: 'memberLike',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'allow', // Changed from 'require' to 'allow'
        },
        // Boolean variables: should start with is/has/have/are
        {
          selector: 'variable',
          types: ['boolean'],
          format: ['PascalCase'],
          prefix: ['is', 'has', 'have', 'are', 'should', 'will', 'can'],
        },
      ],

      // ============================================
      // TYPE SAFETY (from CODESTYLE.md)
      // ============================================

      // Disallow any, prefer unknown
      '@typescript-eslint/no-explicit-any': 'error',

      // Require explicit return types on functions
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: false,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],

      // Require explicit return types on class methods
      // Disabled: Not required for public members
      '@typescript-eslint/explicit-member-accessibility': 'off',

      // Prefer optional chaining
      '@typescript-eslint/prefer-optional-chain': 'error',

      // Disallow non-null assertions
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Require void for functions that don't return values
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        {
          ignoreArrowShorthand: false,
          ignoreVoidOperator: false,
        },
      ],

      // ============================================
      // LOGICAL OPERATORS (from CODESTYLE.md)
      // ============================================

      // Require curly braces for all control statements
      curly: ['error', 'all'],

      // Disallow unnecessary semicolons
      'no-extra-semi': 'error',

      // Enforce consistent brace style
      'brace-style': ['error', '1tbs', { allowSingleLine: false }],

      // ============================================
      // FUNCTIONS AND ARGUMENTS (from CODESTYLE.md)
      // ============================================

      // Warn when function has more than 3 parameters (suggest object)
      'max-params': ['warn', 3],

      // ============================================
      // IMPORTS (from CODESTYLE.md)
      // ============================================

      // No duplicate imports
      'no-duplicate-imports': 'error',

      // Sort imports
      'sort-imports': [
        'warn',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],

      // ============================================
      // CODE QUALITY (from CODESTYLE.md)
      // ============================================

      // Disallow magic numbers (except common ones)
      '@typescript-eslint/no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],

      // Enforce single responsibility (complexity limits)
      complexity: ['warn', 10],
      'max-lines-per-function': [
        'warn',
        {
          max: 50,
          skipBlankLines: true,
          skipComments: true,
        },
      ],

      // No unused variables
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Prefer const over let
      'prefer-const': 'error',

      // No var
      'no-var': 'error',

      // ============================================
      // COMMENTS (from CODESTYLE.md)
      // ============================================

      // Require JSDoc for public class members
      'jsdoc/require-jsdoc': 'off', // Would require jsdoc plugin

      // ============================================
      // BEST PRACTICES
      // ============================================

      // No console.log in production
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Prefer === over ==
      eqeqeq: ['error', 'always'],

      // No eval
      'no-eval': 'error',

      // No implied eval
      'no-implied-eval': 'error',

      // No return await (use return directly)
      '@typescript-eslint/return-await': ['error', 'never'],

      // Consistent return
      'consistent-return': 'off', // TypeScript handles this

      // No empty functions
      '@typescript-eslint/no-empty-function': [
        'error',
        {
          allow: ['constructors'],
        },
      ],

      // Prefer template literals
      'prefer-template': 'error',

      // No unnecessary concatenation
      'no-useless-concat': 'error',

      // Arrow function style
      'arrow-body-style': ['error', 'as-needed'],

      // Object shorthand
      'object-shorthand': ['error', 'always'],

      // ============================================
      // TYPESCRIPT SPECIFIC
      // ============================================

      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: true,
        },
      ],

      // Consistent type exports
      '@typescript-eslint/consistent-type-exports': 'error',

      // No redundant type constituents
      // Disabled: False positives with complex conditional types
      '@typescript-eslint/no-redundant-type-constituents': 'off',

      // Prefer enum over string literal type (align with CODESTYLE.md)
      '@typescript-eslint/prefer-enum-initializers': 'error',

      // Array type style (Array<T> over T[])
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],

      // Consistent generic constructors
      '@typescript-eslint/consistent-generic-constructors': ['error', 'constructor'],

      // Method signature style
      '@typescript-eslint/method-signature-style': ['error', 'method'],
    },
  },

  // Global ignores
  globalIgnores([
    '**/dist',
    '**/build',
    '**/coverage',
    '**/.turbo',
    '**/node_modules',
    '**/*.config.js',
    '**/*.config.cjs',
    '**/*.config.mjs',
  ]),
]);
