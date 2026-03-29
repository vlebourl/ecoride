module.exports = {
  ci: {
    collect: {
      staticDistDir: "./client/dist",
      url: ["http://localhost/"],
      numberOfRuns: 1,
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
