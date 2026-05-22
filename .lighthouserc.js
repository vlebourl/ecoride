module.exports = {
  ci: {
    collect: {
      staticDistDir: "./client/dist",
      url: ["http://localhost/"],
      numberOfRuns: 3,
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
