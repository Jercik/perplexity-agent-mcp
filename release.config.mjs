const releaseConfig = {
  plugins: [
    // The default angular preset cannot parse the Conventional Commits "!" marker,
    // so a "feat!:" squash subject silently produces no release instead of a major.
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    "@semantic-release/npm",
    // Phantom #N refs in commit messages 404 the success-comment step and fail the run.
    ["@semantic-release/github", { successCommentCondition: false }],
  ],
};

export default releaseConfig;
