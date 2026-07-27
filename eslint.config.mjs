import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Los parámetros prefijados con `_` son intencionalmente no usados
    // (firmas exigidas por las Rule de @angular-devkit/schematics).
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Barra de ts-libs (remeda): igualdad estricta salvo el idiom `== null`,
      // type-imports explícitos (los pide `isolatedModules`) y cero `console`
      // en el código de librería: la salida del schematic va por
      // `context.logger`, que sí es testeable.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    // Scripts de build/publish que corren en Node: acá la salida por consola
    // ES la interfaz de usuario del script, no un log olvidado.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
    rules: {
      'no-console': 'off',
    },
  },
  { ignores: ['**/dist/**', '**/node_modules/**'] },
);
