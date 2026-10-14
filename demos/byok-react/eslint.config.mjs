// The demo's own lint: the root eslint.config.mjs ignores demos/** because each demo is its own
// workspace package with its own dependencies and TS project. This config is deliberately lighter
// than the root's -- no type-aware pass, no chai layer -- but it keeps the rules that matter most
// here: nothing written to the console from the library-shaped code, no Math.random near secrets,
// and the house ban on names that say nothing.
import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import chaiFriendly from 'eslint-plugin-chai-friendly'

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**']),

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    name: 'byok-demo/house-style',
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

  // src/byok/ sketches the future library, so it keeps the library's discipline: a stray debug
  // line is how a whisper ends up in someone's log drain.
  {
    name: 'byok-demo/secret-keeping',
    files: ['src/byok/**'],
    rules: {
      'no-console':  'error',
      'no-eval':     'error',
      'no-new-func': 'error',
    },
  },

  // chai's property assertions (`to.be.null`) read as bare expressions; chai-friendly's rule
  // lets an expect chain stand as a statement and still reports any other expression that does
  // nothing (as the root config does, STYLE.md *Tests*).
  {
    name: 'byok-demo/tests-chai',
    files: ['tests/**/*.ts'],
    plugins: { 'chai-friendly': chaiFriendly },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      'chai-friendly/no-unused-expressions':      'error',
    },
  },

  // STYLE.md, *Naming*: bindings that say nothing about what they hold are refused. Only
  // bindings -- never a property, so JSX attributes like `value={...}` stay legal.
  {
    name: 'byok-demo/forbidden-names',
    rules: {
      'no-restricted-syntax': ['error', ...[
        'VariableDeclarator > Identifier.id',
        ':function > Identifier.params',
        ':function > AssignmentPattern.params > Identifier.left',
        'ObjectPattern > Property > Identifier.value',
        'ArrayPattern > Identifier.elements',
      ].map((binding) => ({
        selector: `${binding}[name=/^(key|name|value|node|error|query)$/]`,
        message:  'Name it for what it holds (STYLE.md, Naming): a cryptographic key by its role (vaultKey, dek), a map key `ckey`, `err` for an error, `vaultlabel` over `name`.',
      }))],
    },
  },
])
