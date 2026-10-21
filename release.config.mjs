const releaseConfig = {
  plugins: [
    // The default angular preset cannot parse the Conventional Commits "!" marker,
    // so a "feat!:" squash subject silently produces no release instead of a major.
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    "@semantic-release/npm",
    "@j4k/semantic-release-forgejo",
  ],
};

export default releaseConfig;
