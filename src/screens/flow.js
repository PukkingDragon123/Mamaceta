// Main game flow (placeholder until menus are built)
export async function createMainFlow(game, params, progress) {
  const { DevTest } = await import('./devtest.js');
  return new DevTest();
}
