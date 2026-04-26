import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow `_` prefix for intentionally unused args/vars (e.g. caught errors).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Hono's Hook generic pushes us toward `any` in shared validator hooks
      // (see src/util/zodHook.ts). Keep this as a warning so we notice new ones
      // without blocking the build.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Test files use Node's built-in test runner; relax rules common in tests.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]
