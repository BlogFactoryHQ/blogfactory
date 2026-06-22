const appPromise = import("../server/src/index.js").then((module) => module.app);

const handler = async (request) => {
  const app = await appPromise;
  return app.fetch(request);
};

exports.GET = handler;
exports.POST = handler;
exports.PUT = handler;
exports.DELETE = handler;
exports.PATCH = handler;
exports.OPTIONS = handler;
