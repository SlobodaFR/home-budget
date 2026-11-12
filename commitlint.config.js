module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'test',
        'docs',
        'chore',
        'ci',
        'build',
        'perf',
        // Commits de reformatage seul (convention oxc : reformatage dans un commit séparé).
        'style',
      ],
    ],
  },
};
