export type DemoCallTargets = { gangnam: string; chungang: string };

// Match the public registry's full names as well as the dashboard's short names.
export function demoPhone(name: string, targets: DemoCallTargets): string | undefined {
  const normalized = name.replace(/\s/g, '');
  if (normalized.includes('강남세브란스')) return targets.gangnam;
  if (normalized.includes('중앙대학교병원') || normalized.includes('중앙대병원')) return targets.chungang;
}

export function demoTargets(env: Record<string, string | undefined>): DemoCallTargets | null {
  if (env.DEMO_CALL_ROUTING !== 'true') return null;
  const gangnam = env.DEMO_GANGNAM_PHONE || '', chungang = env.DEMO_CHUNGANG_PHONE || '';
  if (!/^\+8210\d{8}$/.test(gangnam) || !/^\+8210\d{8}$/.test(chungang) || gangnam === chungang)
    throw new Error('데모 수신번호 두 개를 E.164 형식으로 설정하세요.');
  return { gangnam, chungang };
}
