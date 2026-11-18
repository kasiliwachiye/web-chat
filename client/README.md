# Client

React + Vite + TypeScript + Tailwind v4 + shadcn/ui front end for the enterprise chat app.

See the [root README](../README.md) for setup, demo accounts and the demo script, and [docs/LLD.md](../docs/LLD.md) for the component tree.

```bash
npm install
npm run dev     # http://localhost:5173 (proxies /api and /socket.io to :4000)
npm run build   # typecheck + production build
npm run lint    # oxlint
```

Layout: `src/components/ui` (shadcn/ui, owned code), `src/components/chat`, `src/pages`, `src/hooks`, `src/lib`.
