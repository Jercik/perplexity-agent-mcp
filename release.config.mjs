const releaseConfig = {
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/npm",
    // Phantom #N refs in commit messages 404 the success-comment step and fail the run.
    ["@semantic-release/github", { successCommentCondition: false }],
  ],
};

export default releaseConfig;
