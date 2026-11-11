import { authFetch } from '../auth-session.js';

let pendingSaves = 0;
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  if (!pendingSaves) return;
  event.preventDefault();
  event.returnValue = '';
});

export async function saveCreatedArtwork({ blob, filename, title, format }, request = authFetch) {
  if (blob.size > 100_000_000) throw new Error('A arte deve ter até 100 MB para ser salva no histórico.');
  const body = new FormData();
  body.append('artwork', blob, filename);
  body.append('title', title);
  body.append('format', format);
  pendingSaves += 1;
  try {
    const response = await request('/api/artworks', { method: 'POST', body, signal: AbortSignal.timeout(120000) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Não foi possível salvar a arte no histórico.');
    }
    return await response.json();
  } finally { pendingSaves -= 1; }
}

// A failed upload must not prevent the user from downloading the finished export.
export async function rememberCreatedArtwork(artwork) {
  try {
    await saveCreatedArtwork(artwork);
    return 'Salva em Artes criadas.';
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? 'O envio demorou mais que o esperado.' : error.message;
    return `O download está disponível, mas a arte não foi salva em Artes criadas. ${reason || 'Verifique sua conexão.'} Exporte novamente para tentar salvar.`;
  }
}
