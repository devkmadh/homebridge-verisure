module.exports = {
  extends: 'airbnb-base',
  plugins: ['jest'],
  env: {
    'jest/globals': true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    'comma-dangle': ['error', {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      functions: 'never',
    }],
  },
};
