const releaseConfig = {
  plugins: [
    // The default angular preset cannot parse the Conventional Commits "!" marker,
    // so a "feat!:" squash subject silently produces no release instead of a major.
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        writerOpts: {
          // Squashed pull request text and the Co-Authored-By trailer often follow a
          // BREAKING CHANGE footer, and the commit parser keeps them in the note.
          // Keep only the note's first paragraph.
          /** @param {{ noteGroups: { notes: { text: string }[] }[] }} context */
          finalizeContext: (context) => ({
            ...context,
            noteGroups: context.noteGroups.map((group) => ({
              ...group,
              notes: group.notes.map((note) => ({
                ...note,
                text: note.text.replace(/\n[ \t]*\n[\s\S]*$/u, ""),
              })),
            })),
          }),
        },
      },
    ],
    "@semantic-release/npm",
    "@j4k/semantic-release-forgejo",
  ],
};

export default releaseConfig;
