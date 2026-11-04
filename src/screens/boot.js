// Chooses the first screen (supports ?screen=... for development and automated tests).
export async function createFirstScreen(game, params, progress) {
  const which = params.get('screen');
  if (which === 'devtest') {
    const { DevTest } = await import('./devtest.js');
    return new DevTest();
  }
  if (which === 'match') {
    const { MatchScreen } = await import('./match.js');
    const mode = params.get('mode') || 'cpu';
    const cfg = {
      mode,
      players: [
        { char: params.get('p1') || 'jim', cos: { skin: params.get('s1') || 'default', gloves: params.get('g1') || 'default', hitfx: params.get('fx1') || 'classic', trail: params.get('t1') || 'none' }, name: 'P1', cpu: params.get('ai1') ? +params.get('ai1') : null },
        { char: params.get('p2') || 'brutus', cos: { skin: params.get('s2') || 'default' }, name: 'CPU', cpu: mode === 'local' || mode === 'training' ? null : +(params.get('cpu') || 2) },
      ],
      stage: params.get('stage') || 'rustpit', rounds: 3, skipIntro: params.get('intro') !== '1',
      onQuit: () => location.reload(),
    };
    const { ResultsScreen } = await import('./results.js');
    const { ensureLocker, lockerFighters } = await import('./flow.js');
    ensureLocker(game); lockerFighters(game);
    const match = new MatchScreen({ ...cfg, onEnd: (res) => { match.keepAlive = true; game.setScreen(new ResultsScreen(match, res, cfg), { instant: true }); } });
    return match;
  }
  if (which === 'models') {
    const { DevModels } = await import('./devmodels.js');
    return new DevModels(params);
  }
  const { createMainFlow } = await import('./flow.js');
  return createMainFlow(game, params, progress);
}
