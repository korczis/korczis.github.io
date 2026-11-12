// Live Majordomus release card (Alpine.js). The template renders the snapshot from
// data/github.json, so the card is complete without JavaScript and does not shift; this component
// then asks majordomus.dev/build.json (CORS-open) for the current release and says which one it shows.
document.addEventListener('alpine:init', () => {
  Alpine.data('majordomusLive', (url, snapshot) => ({
    state: 'snapshot',
    release: snapshot,
    checked: null,

    async init() {
      try {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const build = await response.json();
        this.release = {
          version: build.release?.version ?? build.source_version ?? snapshot.version,
          tag: build.release?.tag ?? snapshot.tag,
          published_at: build.release?.published_at ?? snapshot.published_at,
          notes_url: build.release?.notes_url ?? snapshot.notes_url,
          commit: build.commit ?? snapshot.commit,
          commit_time: build.commit_time ?? snapshot.commit_time,
        };
        this.state = 'live';
      } catch {
        this.state = 'snapshot';
      }
      this.checked = new Date();
    },

    get shortCommit() {
      return (this.release.commit || '').slice(0, 7);
    },

    date(value) {
      if (!value) return '';
      return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    },
  }));
});
