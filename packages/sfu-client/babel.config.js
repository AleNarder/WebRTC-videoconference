const devPresets = ['@vue/babel-preset-app']
const buildPresets = ['@babel/preset-env', '@babel/preset-typescript']
module.exports = {
  presets: process.env.NODE_ENV === 'development' ? devPresets : buildPresets,
  plugins: [
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-nullish-coalescing-operator',
    '@babel/plugin-proposal-optional-chaining',
  ],
}
