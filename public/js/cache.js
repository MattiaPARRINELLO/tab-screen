(async function(){
  const tbody = document.querySelector('#cacheTable tbody');
  const modal = document.getElementById('lyricsModal');
  const lyricsContent = document.getElementById('lyricsContent');
  const closeBtn = document.getElementById('closeBtn');

  function fmtDate(ts){
    try{ return new Date(ts).toLocaleString(); }catch(e){return ''}
  }

  function rowFor(item){
    const tr = document.createElement('tr');
    const title = item.track || '(inconnu)';
    const artist = item.artist || '(inconnu)';
    tr.innerHTML = `
      <td>${escapeHtml(title)}</td>
      <td>${escapeHtml(artist)}</td>
      <td class="preview">${escapeHtml(item.preview||'')}</td>
      <td>${fmtDate(item.timestamp)}</td>
      <td>${item.size} B</td>
      <td><button class="btn" data-file="${encodeURIComponent(item.file)}">Voir</button></td>
    `;
    return tr;
  }

  function escapeHtml(s){ return (s+"").replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function load(){
    try{
      const res = await fetch('/api/lyrics-cache');
      const data = await res.json();
      tbody.innerHTML='';
      (data.list||[]).forEach(item=>{
        const tr = rowFor(item);
        tbody.appendChild(tr);
      });
      // attach handlers
      tbody.querySelectorAll('button').forEach(btn=>{
        btn.addEventListener('click', async (e)=>{
          const file = decodeURIComponent(btn.dataset.file);
          // fetch full entry
          const r = await fetch(`/api/lyrics-cache/${file}`);
          if (!r.ok) { alert('Erreur lecture cache'); return; }
          const json = await r.json();
          const entry = json.entry;
          lyricsContent.innerHTML = `<div class="meta"><strong>${escapeHtml(entry.track||'(inconnu)')}</strong> — ${escapeHtml(entry.artist||'')}</div><pre style="white-space:pre-wrap">${escapeHtml(entry.syncedLyrics||'')}</pre>`;
          modal.style.display='flex';
        });
      });
    }catch(e){
      tbody.innerHTML='<tr><td colspan="6">Erreur chargement du cache</td></tr>';
    }
  }

  closeBtn.addEventListener('click', ()=>{ modal.style.display='none'; });
  modal.addEventListener('click', (e)=>{ if (e.target===modal) modal.style.display='none'; });

  load();
})();
