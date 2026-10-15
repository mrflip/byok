// eslint.config.mjs -- the workspace root's own lint: its tooling in scripts/, those scripts'
// tests, and the root's config files.
//
// Cut from packages/safebyok/eslint.config.mjs, which is the authority on house style: where the
// two disagree, the core's config is right and this one is the bug. Each package under packages/
// and demos/ is its own workspace package, with its own dependencies, TS project and eslint config,
// and lints itself; the root's `pnpm lint` runs them all.
import { defineConfig, globalIgnores } from 'eslint/config'
import js                              from '@eslint/js'
import tseslint                        from 'typescript-eslint'
import unicorn                         from 'eslint-plugin-unicorn'
import sonarjs                         from 'eslint-plugin-sonarjs'
import stylistic                       from '@stylistic/eslint-plugin'
import vitest                          from '@vitest/eslint-plugin'
import chaiFriendly                    from 'eslint-plugin-chai-friendly'

/** Everything we lint. */
const SourceFiles = ['**/*.{js,mjs,cjs,ts,mts,cts}']

export default defineConfig([
  globalIgnores([
    'coverage/**',
    // Agents' worktrees: another checkout's code, linted there if anywhere.
    '.claude/worktrees/**',
    // Workspace packages: each lints itself, with its own config.
    'packages/**',
    'demos/**',
  ]),

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  sonarjs.configs.recommended,

  {
    name: 'safebyok-workspace/type-aware',
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // The core's house style, less the rules it turns off (no preset here turns them on).
  {
    name: 'safebyok-workspace/house-style',
    files: SourceFiles,
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/comma-dangle':                   ['warn', 'always-multiline'],
      '@stylistic/eol-last':                       ['warn', 'always'],
      '@stylistic/function-call-argument-newline': ['warn', 'consistent'],
      '@stylistic/function-paren-newline':         ['warn', 'consistent'],
      '@stylistic/generator-star-spacing':         ['warn', { before: true, after: true }],
      '@stylistic/indent':                         ['warn', 2, { SwitchCase: 0 }],
      '@stylistic/linebreak-style':                ['error', 'unix'],
      '@stylistic/no-mixed-operators':             ['error'],
      '@stylistic/no-multiple-empty-lines':        ['warn'],
      '@stylistic/no-trailing-spaces':             ['warn'],
      '@stylistic/semi':                           ['warn', 'never'],

      'func-style':                                ['error', 'declaration', { allowArrowFunctions: true }],
      'no-else-return':                            ['warn'],
      'no-implicit-coercion':                      ['error', { allow: ['!!'] }],
      'no-negated-condition':                      ['error'],
      'no-var':                                    ['error'],
      'prefer-destructuring':                      ['warn', { object: true, array: false }],

      '@typescript-eslint/no-unused-vars': ['warn', {
        varsIgnorePattern:         '^_',
        argsIgnorePattern:         '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // Plugin defaults STYLE.md contradicts, as the core's config has them.
  {
    name: 'safebyok-workspace/house-overrides',
    files: SourceFiles,
    rules: {
      'unicorn/single-line-block-comment-style':              'off',
      'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',
      'unicorn/no-null':                                      'off',
      'unicorn/name-replacements':                            'off',
      'unicorn/consistent-boolean-name':                      'off',
      'unicorn/filename-case':                                ['error', { cases: { kebabCase: true } }],
      'unicorn/catch-error-name':                             ['error', { name: 'err' }],
      'unicorn/prefer-ternary':                               'off',
      '@typescript-eslint/consistent-type-definitions':       'off',
    },
  },

  // STYLE.md, *Naming*: bindings that say nothing about what they hold are refused.
  {
    name: 'safebyok-workspace/forbidden-names',
    files: SourceFiles,
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

  // A config file's whole job is the call it exports.
  {
    name: 'safebyok-workspace/config-files',
    files: ['*.config.{ts,mts,mjs}'],
    rules: {
      'unicorn/no-top-level-side-effects': 'off',
    },
  },

  // Loose scripts sit outside the TS project, so the type-aware rules cannot run on them.
  {
    name: 'safebyok-workspace/untyped-config-files',
    files: ['**/*.mjs', '**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // chai's property assertions (`to.be.true`) are the house style (STYLE.md), so vitest's
  // valid-expect is off and chai-friendly lets an expect chain stand as a statement.
  {
    name: 'safebyok-workspace/tests',
    files: ['tests/**/*.ts'],
    extends: [vitest.configs.recommended],
    plugins: { 'chai-friendly': chaiFriendly },
    rules: {
      'vitest/no-disabled-tests':                 'warn',
      'vitest/no-focused-tests':                  'warn',
      'vitest/valid-title':                       'off',
      'vitest/valid-expect':                      'off',
      'sonarjs/assertions-in-tests':              'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'chai-friendly/no-unused-expressions':      'error',
    },
  },
])
