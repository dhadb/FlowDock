import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import babelParser from '@babel/eslint-parser'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'release/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      parser: babelParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { presets: ['@babel/preset-react'] },
      },
      globals: {
        Blob: 'readonly',
        crypto: 'readonly',
        window: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
    },
  },
]
