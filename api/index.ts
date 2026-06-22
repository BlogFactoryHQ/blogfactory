const appPromise = import("../server/src/index.js").then((module) => module.app);

const handler = async (request: Request) => {
  const app = await appPromise;
  return app.fetch(request);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
