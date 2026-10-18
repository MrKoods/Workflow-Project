// Loads a skin from skins/<name>/: tokens.json -> CSS custom properties on :root,
// skin.css -> one <style id="skin"> element. Adding a skin only adds a folder.

export interface SkinTokens {
  name: string;
  fx: {
    particles: { kind: string; count: number };
    celebration: { objective: string; quest: string };
  };
  [group: string]: unknown;
}

const tokenFiles = import.meta.glob<SkinTokens>('../skins/*/tokens.json', {
  import: 'default',
});
const styleFiles = import.meta.glob<string>('../skins/*/skin.css', {
  query: '?inline',
  import: 'default',
});

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

// { color: { taskBright: '#..' } } -> [['--color-task-bright', '#..']]
// Non-string leaves (e.g. fx.particles.count) are for TS, not CSS.
function flatten(obj: object, prefix: string[] = []): [string, string][] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = [...prefix, kebab(key)];
    if (typeof value === 'string') return [[`--${path.join('-')}`, value]];
    if (value && typeof value === 'object') return flatten(value, path);
    return [];
  });
}

export async function loadSkin(name: string): Promise<SkinTokens> {
  const loadTokens = tokenFiles[`../skins/${name}/tokens.json`];
  const loadStyle = styleFiles[`../skins/${name}/skin.css`];
  if (!loadTokens || !loadStyle) throw new Error(`Unknown skin: ${name}`);

  const [tokens, css] = await Promise.all([loadTokens(), loadStyle()]);
  const { name: _label, ...groups } = tokens;
  const root = document.documentElement.style;
  for (const [prop, value] of flatten(groups)) root.setProperty(prop, value);

  let style = document.getElementById('skin') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'skin';
    document.head.append(style);
  }
  style.textContent = css;
  document.documentElement.dataset.skin = name;
  return tokens;
}
