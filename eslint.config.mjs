import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  // Lint CON información de tipos: es la única forma de que reglas como
  // no-floating-promises o no-unsafe-* vean lo que el compilador ve.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
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
  {
    // Los `.mjs` (config de eslint, scripts de build) no están en ningún
    // tsconfig: se lintean sin información de tipos.
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // `.tmp-emitted-spec-*` es el dir transitorio donde la suite ejecuta el
  // codigo emitido; se borra solo, pero una corrida abortada no debe romper lint.
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.tmp-emitted-spec-*/**'] },
);
