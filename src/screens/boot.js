// Chooses the first screen (supports ?screen=... for development and automated tests).
export async function createFirstScreen(game, params, progress) {
  const which = params.get('screen');
  if (which === 'devtest') {
    const { DevTest } = await import('./devtest.js');
    return new DevTest();
  }
  if (which === 'models') {
    const { DevModels } = await import('./devmodels.js');
    return new DevModels(params);
  }
  const { createMainFlow } = await import('./flow.js');
  return createMainFlow(game, params, progress);
}
