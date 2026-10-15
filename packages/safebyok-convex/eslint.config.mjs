// The Convex package's own lint: the root eslint.config.mjs ignores packages/** because each
// package is its own workspace package with its own dependencies and TS project. Lighter than the
// core's (packages/safebyok/eslint.config.mjs: no type-aware pass), but it keeps what matters most
// in library-shaped code: nothing to the console, no Math.random, and the house ban on names that
// say nothing.
import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import chaiFriendly from 'eslint-plugin-chai-friendly'

export default defineConfig([
  // `.claude/` holds Convex's agent skills (Markdown, never run); `_generated/` is Convex's
  // codegen output, written by its templates and never edited by hand.
  globalIgnores(['dist/**', 'node_modules/**', '.claude/**', 'src/component/_generated/**']),

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // In a monorepo the parser sees several candidate tsconfig roots and refuses to guess; this
  // package's own directory is the answer.
  {
    name: 'safebyok-convex/ts-project',
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },

  {
    name: 'safebyok-convex/house-style',
    rules: {
      'no-var':       'error',
      'prefer-const': 'error',
      'no-restricted-properties': ['error', {
        object:   'Math',
        property: 'random',
        message:  'Use crypto.getRandomValues: Math.random is not a source of secret randomness.',
      }],
      '@typescript-eslint/no-unused-vars': ['warn', {
        varsIgnorePattern:         '^_',
        argsIgnorePattern:         '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // Library code says what it has to say to its caller, never to the console: a Convex
  // function's log lines land in the host's dashboard.
  {
    name: 'safebyok-convex/secret-keeping',
    files: ['src/**'],
    rules: {
      'no-console':  'error',
      'no-eval':     'error',
      'no-new-func': 'error',
    },
  },

  // chai's property assertions (`to.be.null`) read as bare expressions; chai-friendly's rule
  // lets an expect chain stand as a statement and still reports any other dead expression.
  {
    name: 'safebyok-convex/tests-chai',
    files: ['tests/**'],
    plugins: { 'chai-friendly': chaiFriendly },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      'chai-friendly/no-unused-expressions':      'error',
    },
  },

  // STYLE.md, *Naming*: bindings that say nothing about what they hold are refused. Only
  // bindings -- never a property, so a Convex `{ value: ... }` stays legal.
  {
    name: 'safebyok-convex/forbidden-names',
    rules: {
      'no-restricted-syntax': ['error', ...[
        'VariableDeclarator > Identifier.id',
        ':function > Identifier.params',
        ':function > AssignmentPattern.params > Identifier.left',
        'ObjectPattern > Property > Identifier.value',
        'ArrayPattern > Identifier.elements',
      ].map((binding) => ({
        selector: `${binding}[name=/^(key|name|value|node|error|query)$/]`,
        message:  'Name it for what it holds (STYLE.md, Naming): a cryptographic key by its role (vaultKey, lockboxKey: VOCABULARY.md), a map key `ckey`, `err` for an error, `vaultlabel` over `name`.',
      }))],
    },
  },
])
