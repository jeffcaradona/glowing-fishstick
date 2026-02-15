import js from '@eslint/js';

const commonGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  global: 'readonly',
};

const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  fetch: 'readonly',
};

const nodeTimerGlobals = {
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setImmediate: 'readonly',
};

const testGlobals = {
  describe: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
};

const commonRules = {
  ...js.configs.recommended.rules,
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-arrow-callback': 'warn',
  'no-param-reassign': [
    'error',
    { props: true, ignorePropertyModificationsFor: ['req', 'res', 'next', 'app'] },
  ],
  eqeqeq: ['error', 'always'],
  curly: ['error', 'all'],
  'brace-style': ['error', '1tbs'],
  semi: ['error', 'always'],
  quotes: ['error', 'single', { avoidEscape: true }],
  'comma-dangle': ['error', 'always-multiline'],
  indent: ['error', 2],
  'no-trailing-spaces': 'error',
  'max-len': ['warn', { code: 100, ignoreUrls: true, ignoreStrings: true }],
  'object-curly-spacing': ['error', 'always'],
  'array-bracket-spacing': ['error', 'never'],
  'key-spacing': ['error', { beforeColon: false, afterColon: true }],
  'keyword-spacing': ['error', { before: true, after: true }],
  'space-before-function-paren': [
    'error',
    { anonymous: 'always', named: 'never', asyncArrow: 'always' },
  ],
  'no-irregular-whitespace': 'error',
  'no-multiple-empty-lines': ['error', { max: 1 }],
  'eol-last': ['error', 'always'],
};

export default [
  {
    ignores: ['node_modules', 'dist', '.git', '.next', 'build', 'coverage', '*.lock'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...commonGlobals,
        ...browserGlobals,
        ...nodeTimerGlobals,
      },
    },
    rules: commonRules,
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...commonGlobals,
        ...browserGlobals,
        ...nodeTimerGlobals,
        ...testGlobals,
      },
    },
    rules: commonRules,
  },
  {
    files: ['**/*.js'],
    ignores: ['node_modules', 'dist'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  {
    files: [
      '**/src/**-factory.js',
      'core/app/src/app-factory.js',
      'core/shared/src/server-factory.js',
    ],
    rules: {
      'no-param-reassign': 'off',
    },
  },
];
